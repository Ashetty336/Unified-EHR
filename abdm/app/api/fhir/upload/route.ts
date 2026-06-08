import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireRole } from '@/lib/auth'
import { convertCcda, convertJson, type CcdaTemplate, type JsonTemplate } from '@/lib/fhir/converter'
import { storeFhirBundle } from '@/lib/fhir/hapi'
import { tagBundleResources, injectAbhaIdentifier, toBatchBundle, type ResourceTag } from '@/lib/fhir/bundle'
import { auditLog } from '@/lib/audit'
import { adminClient } from '@/lib/supabase/admin'
import { extractTextFromPdf } from '@/lib/pdf/extract'
import { structurePdfText } from '@/lib/pdf/structure'
import { pdfReportToBundle } from '@/lib/pdf/to-fhir'
import { ccdaToFhirBundle } from '@/lib/ccda/to-fhir'
import { buildStoragePath, uploadOriginalFile } from '@/lib/storage'

// POST /api/fhir/upload
// Body: multipart/form-data
//   inputType: 'ccda' | 'json' | 'pdf'  (defaults to 'ccda')
//   file: C-CDA XML, JSON, or PDF file
//   patientId: internal UUID of patient
//   template?: CcdaTemplate | JsonTemplate (ignored for pdf)
//
// PDF pipeline: PDF → OCR/parse text → structured JSON → convertJson → FHIR Bundle
// Doctors and hospitals can upload on behalf of a patient.
// The uploaded FHIR bundle is stored in HAPI.
// If patient has no fhir_patient_id yet, it is extracted from the bundle and saved.
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'doctor', 'hospital', 'admin')
  if (!auth.ok) return auth.response

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 })
  }

  const file = formData.get('file')
  const patientIdRaw = formData.get('patientId') as string | null
  const abhaInput = formData.get('abhaNumber') as string | null
  const inputType = (formData.get('inputType') as string | null) ?? 'ccda'
  const template = formData.get('template') as string | null

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (inputType !== 'ccda' && inputType !== 'json' && inputType !== 'pdf') {
    return NextResponse.json({ error: 'inputType must be ccda, json, or pdf' }, { status: 400 })
  }

  // Accept either internal patient user_id (legacy) or ABHA number (preferred for hospitals/doctors).
  let patientId: string | undefined = patientIdRaw?.trim() || undefined
  if (!patientId && abhaInput?.trim()) {
    const { data: byAbha } = await adminClient
      .from('patients')
      .select('user_id')
      .eq('abha_number', abhaInput.trim())
      .single()
    patientId = byAbha?.user_id ?? undefined
    if (!patientId) {
      return NextResponse.json({ error: 'no patient found for ABHA' }, { status: 404 })
    }
  }
  if (!patientId) {
    return NextResponse.json({ error: 'patientId or abhaNumber is required' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const content = Buffer.from(arrayBuffer)
  const originalFilename = (file as File).name || `upload.${inputType}`
  const fileContentType = (file as File).type || (
    inputType === 'pdf' ? 'application/pdf' :
    inputType === 'json' ? 'application/json' :
    'application/xml'
  )

  // ABHA lookup happens here so we can pass it into the CCDA mapper for identifier injection.
  const { data: earlyPatient } = await adminClient
    .from('patients')
    .select('abha_number')
    .eq('user_id', patientId)
    .single()
  const abhaForBuilder: string | undefined = earlyPatient?.abha_number ?? undefined

  let convertResult
  if (inputType === 'pdf') {
    // Step 1: extract text from digital PDF (pdf-parse via pdfjs-dist).
    const extracted = await extractTextFromPdf(content)
    if (!extracted.ok) {
      return NextResponse.json({ error: `PDF text extraction failed: ${extracted.error}` }, { status: 422 })
    }

    // Step 2: structure raw text into a clinical record (regex-based extraction).
    const structured = structurePdfText(extracted.text)

    // Step 3: build FHIR Bundle directly (bypass MS converter — its bundled
    // ExamplePatient Liquid template only emits demographics and drops labs/meds/dx).
    convertResult = { ok: true, bundle: pdfReportToBundle(structured) } as const
  } else if (inputType === 'json') {
    let parsed: object
    try {
      parsed = JSON.parse(content.toString('utf-8'))
    } catch {
      return NextResponse.json({ error: 'file is not valid JSON' }, { status: 400 })
    }
    convertResult = await convertJson(parsed, (template as JsonTemplate | null) ?? 'ExamplePatient')
  } else {
    // CCDA: bypass MS converter — direct mapper covers more sections (medications,
    // encounters, immunizations, diagnostic reports) which the bundled Liquid templates
    // either drop or emit in shapes HAPI rejects.
    if (template) {
      // Caller can opt back into MS converter via explicit template param.
      convertResult = await convertCcda(content, template as CcdaTemplate)
    } else {
      try {
        convertResult = {
          ok: true as const,
          bundle: ccdaToFhirBundle(content.toString('utf-8'), { abhaNumber: abhaForBuilder }),
        }
      } catch (err) {
        convertResult = { ok: false as const, error: err instanceof Error ? err.message : String(err) }
      }
    }
  }
  if (!convertResult.ok) {
    return NextResponse.json({ error: `conversion failed: ${convertResult.error}` }, { status: 422 })
  }

  const bundle = convertResult.bundle as Record<string, unknown>

  // Look up patient ABHA number to inject as identifier on the Patient resource.
  // Cross-hospital lookup uses identifier=urn:abha|<num> later.
  const { data: patientLookup } = await adminClient
    .from('patients')
    .select('patient_id, abha_number')
    .eq('user_id', patientId)
    .single()
  const abhaNumber: string | undefined = patientLookup?.abha_number ?? undefined
  const patientPk: string | undefined = patientLookup?.patient_id ?? undefined

  // Use batch (not transaction) so HAPI does not enforce cross-resource reference
  // resolution within the bundle — converter output may reference resources that
  // are not present (e.g. Composition.author -> Device not generated).
  // Keep converter-emitted PUT requests with URL "<Type>/<id>" so resource IDs are
  // preserved, which keeps inter-resource references valid post-store.
  const entries = Array.isArray(bundle.entry)
    ? (bundle.entry as Record<string, unknown>[])
    : []

  // Inject ABHA identifier into the Patient resource before storing.
  if (abhaNumber) injectAbhaIdentifier(entries, abhaNumber)

  // Determine custodian hospital tag.
  // Hospitals tag with their own hospital_id; doctors with their hospital_id; patients with 'self'.
  let hospitalTagCode: string | null = null
  if (auth.profile.role === 'hospital') {
    const { data: h } = await adminClient
      .from('hospitals')
      .select('hospital_id')
      .eq('user_id', auth.profile.user_id)
      .single()
    hospitalTagCode = h?.hospital_id ?? null
  } else if (auth.profile.role === 'doctor') {
    const { data: d } = await adminClient
      .from('doctors')
      .select('hospital_id')
      .eq('user_id', auth.profile.user_id)
      .single()
    hospitalTagCode = d?.hospital_id ?? null
  } else {
    hospitalTagCode = 'self'
  }

  // Reserve upload_id so all FHIR resources from this upload share the tag.
  const uploadId = randomUUID()

  const tags: ResourceTag[] = [{ system: 'urn:upload', code: uploadId }]
  if (hospitalTagCode) tags.push({ system: 'urn:hospital', code: hospitalTagCode })
  if (abhaNumber) tags.push({ system: 'urn:abha', code: abhaNumber })
  tagBundleResources(entries, tags)

  const transactionBundle = toBatchBundle({ ...bundle, entry: entries })

  // Save the original file to Supabase Storage. Failure is logged but not fatal —
  // the FHIR bundle still goes to HAPI; only the "view original" link will be missing.
  const storagePath = buildStoragePath(patientId, uploadId, originalFilename)
  const storeOriginal = await uploadOriginalFile(storagePath, content, fileContentType)
  if (!storeOriginal.ok) {
    console.error('[fhir/upload] storage error:', storeOriginal.error)
  }

  // Pre-upload entry breakdown — what the converter produced
  const inputCounts: Record<string, number> = {}
  for (const entry of entries) {
    const rt = (entry.resource as { resourceType?: string } | undefined)?.resourceType ?? 'Unknown'
    inputCounts[rt] = (inputCounts[rt] ?? 0) + 1
  }
  console.log('[fhir/upload] converter produced:', inputCounts)

  let storedBundle: object
  try {
    storedBundle = await storeFhirBundle(transactionBundle)
  } catch (err) {
    console.error('[fhir/upload] store error:', err)
    return NextResponse.json({ error: 'failed to store FHIR bundle' }, { status: 502 })
  }

  // Post-upload entry breakdown — what HAPI accepted and rejected
  const respEntries = (storedBundle as { entry?: { response?: { status?: string; location?: string; outcome?: { issue?: { diagnostics?: string }[] } } }[] }).entry ?? []
  const acceptCounts: Record<string, number> = {}
  const rejectSamples: { type: string; status: string; reason: string }[] = []
  respEntries.forEach((e, idx) => {
    const status = e.response?.status ?? '?'
    const ok = status.startsWith('2')
    const inputType = (entries[idx]?.resource as { resourceType?: string } | undefined)?.resourceType ?? 'Unknown'
    if (ok) {
      acceptCounts[inputType] = (acceptCounts[inputType] ?? 0) + 1
    } else if (rejectSamples.length < 6) {
      const reason = e.response?.outcome?.issue?.[0]?.diagnostics ?? ''
      rejectSamples.push({ type: inputType, status, reason: reason.slice(0, 250) })
    }
  })
  console.log('[fhir/upload] HAPI accepted:', acceptCounts)
  if (rejectSamples.length > 0) console.log('[fhir/upload] sample rejects:', rejectSamples)

  // Extract FHIR Patient ID from stored bundle response and backfill Supabase if needed
  let fhirPatientIdForUpload: string | null = null
  let acceptedCount = 0
  try {
    const responseBundle = storedBundle as { entry?: { response?: { status?: string; location?: string } }[] }
    for (const e of responseBundle.entry ?? []) {
      if (e.response?.status?.startsWith('2')) acceptedCount++
    }
    const patientLocation = responseBundle.entry?.find((e) =>
      e.response?.location?.startsWith('Patient/'),
    )?.response?.location
    if (patientLocation) fhirPatientIdForUpload = patientLocation.split('/')[1] ?? null

    const { data: patientRow } = await adminClient
      .from('patients')
      .select('fhir_patient_id')
      .eq('user_id', patientId)
      .single()
    if (!patientRow?.fhir_patient_id && fhirPatientIdForUpload) {
      await adminClient
        .from('patients')
        .update({ fhir_patient_id: fhirPatientIdForUpload })
        .eq('user_id', patientId)
    }
  } catch (err) {
    console.error('[fhir/upload] post-store error:', err)
  }

  // Persist upload metadata so the patient dashboard can list "original ⇄ FHIR" pairs by hospital.
  if (storeOriginal.ok) {
    const hospitalIdForRow = (auth.profile.role === 'patient' ? null : hospitalTagCode) ?? null
    const { error: insertErr } = await adminClient.from('medical_uploads').insert({
      upload_id: uploadId,
      patient_user_id: patientId,
      uploaded_by: auth.profile.user_id,
      uploader_role: auth.profile.role,
      hospital_id: hospitalIdForRow,
      abha_number: abhaNumber ?? null,
      input_type: inputType,
      original_filename: originalFilename,
      storage_path: storagePath,
      content_type: fileContentType,
      file_size: content.length,
      fhir_patient_id: fhirPatientIdForUpload,
      resource_count: acceptedCount,
    })
    if (insertErr) {
      console.error('[fhir/upload] medical_uploads insert error:', insertErr)
    }
  }

  if (patientPk) {
    auditLog({
      accessed_by: auth.profile.user_id,
      accessor_role: auth.profile.role,
      patient_id: patientPk,
      action: 'fhir_upload',
      resource_type: 'Bundle',
      user_agent: req.headers.get('user-agent') ?? undefined,
    })
  }

  return NextResponse.json({ ok: true, upload_id: uploadId, accepted: acceptedCount }, { status: 201 })
}
