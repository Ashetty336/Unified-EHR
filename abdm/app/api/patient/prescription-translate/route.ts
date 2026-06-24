import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireRole } from '@/lib/auth'
import { storeFhirBundle } from '@/lib/fhir/hapi'
import { tagBundleResources, injectAbhaIdentifier, toBatchBundle, type ResourceTag } from '@/lib/fhir/bundle'
import { adminClient } from '@/lib/supabase/admin'
import { buildStoragePath, uploadOriginalFile } from '@/lib/storage'
import { extractPrescription } from '@/lib/groq/prescription'
import { prescriptionToBundle } from '@/lib/groq/to-fhir'

// POST /api/patient/prescription-translate
// Patient uploads a prescription IMAGE (Kannada/Hindi/Tamil/English). A Groq
// vision model does OCR + language detection + English translation + medication
// extraction. Extracted meds become FHIR MedicationRequest resources stored in
// HAPI and indexed in medical_uploads + prescriptions, exactly like /upload.
// Unlike /upload, the response also returns the extraction + bundle so the UI
// can render the translation and FHIR JSON without a second fetch.

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'patient')
  if (!auth.ok) return auth.response

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const contentType = (file as File).type || 'application/octet-stream'
  if (!ALLOWED_IMAGE_TYPES.has(contentType.toLowerCase())) {
    return NextResponse.json(
      { error: 'Unsupported file type. Upload a PNG, JPG, or WEBP image of the prescription.' },
      { status: 400 },
    )
  }

  const arrayBuffer = await file.arrayBuffer()
  const content = Buffer.from(arrayBuffer)
  if (content.length === 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 400 })
  }
  if (content.length > MAX_BYTES) {
    return NextResponse.json({ error: 'image exceeds 15 MB limit' }, { status: 413 })
  }
  const originalFilename = (file as File).name || 'prescription.png'

  // 1. Groq: OCR + detect + translate + extract.
  const extracted = await extractPrescription(content.toString('base64'), contentType)
  if (!extracted.ok) {
    return NextResponse.json({ error: extracted.error }, { status: extracted.status ?? 502 })
  }
  const extraction = extracted.extraction

  // 2. Map to a FHIR R4 bundle.
  const bundle = prescriptionToBundle(extraction) as Record<string, unknown>
  const entries = Array.isArray(bundle.entry) ? (bundle.entry as Record<string, unknown>[]) : []

  // 3. ABHA identifier + tagging (identical to /api/patient/upload).
  const { data: patientLookup } = await adminClient
    .from('patients')
    .select('abha_number, fhir_patient_id')
    .eq('user_id', auth.profile.user_id)
    .single()
  const abhaNumber: string | undefined = patientLookup?.abha_number ?? undefined
  if (abhaNumber) injectAbhaIdentifier(entries, abhaNumber)

  const uploadId = randomUUID()
  const tags: ResourceTag[] = [
    { system: 'urn:hospital', code: 'self' },
    { system: 'urn:upload', code: uploadId },
  ]
  if (abhaNumber) tags.push({ system: 'urn:abha', code: abhaNumber })
  tagBundleResources(entries, tags)

  const batchBundle = toBatchBundle({ ...bundle, entry: entries })

  // 4. Save the original image. FHIR is still stored if storage fails.
  const storagePath = buildStoragePath(auth.profile.user_id, uploadId, originalFilename)
  const storeOriginal = await uploadOriginalFile(storagePath, content, contentType)
  if (!storeOriginal.ok) {
    console.error('[prescription-translate] storage error:', storeOriginal.error)
  }

  // 5. Store the bundle in HAPI.
  let storedBundle: object
  try {
    storedBundle = await storeFhirBundle(batchBundle)
  } catch (err) {
    console.error('[prescription-translate] store error:', err)
    return NextResponse.json({ error: 'failed to store FHIR bundle' }, { status: 502 })
  }

  // 6. Inspect HAPI response: count accepted, capture Patient + MedicationRequest ids.
  let fhirPatientId: string | null = null
  let acceptedCount = 0
  const medicationRequestIds: string[] = []
  try {
    const responseBundle = storedBundle as { entry?: { response?: { status?: string; location?: string } }[] }
    for (const e of responseBundle.entry ?? []) {
      const status = e.response?.status
      const location = e.response?.location
      if (status?.startsWith('2')) acceptedCount++
      if (!location) continue
      if (location.startsWith('Patient/')) {
        fhirPatientId = location.split('/')[1] ?? fhirPatientId
      } else if (location.startsWith('MedicationRequest/')) {
        const id = location.split('/')[1]
        if (id) medicationRequestIds.push(id)
      }
    }

    if (!patientLookup?.fhir_patient_id && fhirPatientId) {
      await adminClient
        .from('patients')
        .update({ fhir_patient_id: fhirPatientId })
        .eq('user_id', auth.profile.user_id)
    }
  } catch (err) {
    console.error('[prescription-translate] post-store error:', err)
  }

  // 7. Record the upload row (only when the original was saved).
  if (storeOriginal.ok) {
    const { error: insertErr } = await adminClient.from('medical_uploads').insert({
      upload_id: uploadId,
      patient_user_id: auth.profile.user_id,
      uploaded_by: auth.profile.user_id,
      uploader_role: auth.profile.role,
      hospital_id: null,
      abha_number: abhaNumber ?? null,
      input_type: 'image',
      original_filename: originalFilename,
      storage_path: storagePath,
      content_type: contentType,
      file_size: content.length,
      fhir_patient_id: fhirPatientId,
      resource_count: acceptedCount,
    })
    if (insertErr) {
      console.error('[prescription-translate] medical_uploads insert error:', insertErr)
    }
  }

  // 8. Index each MedicationRequest in the prescriptions table so it surfaces in
  //    the Prescriptions tab. Pair stored ids with extracted meds by order.
  if (medicationRequestIds.length) {
    const rows = medicationRequestIds.map((fhirResourceId, i) => {
      const med = extraction.medications[i]
      return {
        patient_user_id: auth.profile.user_id,
        doctor_user_id: auth.profile.user_id, // self-uploaded; no linked prescriber account
        fhir_resource_id: fhirResourceId,
        medication: med?.name ?? 'Medication',
        dosage: med ? [med.dosage, med.frequency].filter(Boolean).join(' ') || null : null,
        status: 'active',
      }
    })
    const { error: rxErr } = await adminClient.from('prescriptions').insert(rows)
    if (rxErr) {
      console.error('[prescription-translate] prescriptions insert error:', rxErr)
    }
  }

  return NextResponse.json(
    {
      ok: true,
      upload_id: uploadId,
      accepted: acceptedCount,
      extraction,
      bundle: batchBundle,
    },
    { status: 201 },
  )
}
