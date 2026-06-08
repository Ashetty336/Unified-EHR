import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireRole } from '@/lib/auth'
import { convertCcda, convertJson, type CcdaTemplate, type JsonTemplate } from '@/lib/fhir/converter'
import { storeFhirBundle } from '@/lib/fhir/hapi'
import { tagBundleResources, injectAbhaIdentifier, toBatchBundle, type ResourceTag } from '@/lib/fhir/bundle'
import { adminClient } from '@/lib/supabase/admin'
import { extractTextFromPdf } from '@/lib/pdf/extract'
import { structurePdfText } from '@/lib/pdf/structure'
import { pdfReportToBundle } from '@/lib/pdf/to-fhir'
import { ccdaToFhirBundle } from '@/lib/ccda/to-fhir'
import { buildStoragePath, uploadOriginalFile } from '@/lib/storage'

// POST /api/patient/upload
// Patient uploads their own clinical document (PDF, C-CDA, or JSON).
// Stores the original blob, converts to FHIR, stamps every resource with
// urn:upload|<upload_id> so the dashboard can pair "original ⇄ FHIR" later.
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
  const inputType = (formData.get('inputType') as string | null) ?? 'pdf'
  const template = formData.get('template') as string | null

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (inputType !== 'ccda' && inputType !== 'pdf' && inputType !== 'json') {
    return NextResponse.json({ error: 'inputType must be ccda, pdf, or json' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const content = Buffer.from(arrayBuffer)
  const originalFilename = (file as File).name || `upload.${inputType}`
  const contentType = (file as File).type || (
    inputType === 'pdf' ? 'application/pdf' :
    inputType === 'json' ? 'application/json' :
    'application/xml'
  )

  let convertResult
  if (inputType === 'pdf') {
    const extracted = await extractTextFromPdf(content)
    if (!extracted.ok) {
      return NextResponse.json({ error: `PDF extraction failed: ${extracted.error}` }, { status: 422 })
    }
    const structured = structurePdfText(extracted.text)
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
    // Look up ABHA up front so the CCDA mapper can inject the identifier.
    const { data: pre } = await adminClient
      .from('patients')
      .select('abha_number')
      .eq('user_id', auth.profile.user_id)
      .single()
    if (template) {
      convertResult = await convertCcda(content, template as CcdaTemplate)
    } else {
      try {
        convertResult = {
          ok: true as const,
          bundle: ccdaToFhirBundle(content.toString('utf-8'), { abhaNumber: pre?.abha_number ?? undefined }),
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
  const entries = Array.isArray(bundle.entry) ? (bundle.entry as Record<string, unknown>[]) : []

  // Look up patient ABHA for identifier injection + tagging.
  const { data: patientLookup } = await adminClient
    .from('patients')
    .select('abha_number')
    .eq('user_id', auth.profile.user_id)
    .single()
  const abhaNumber: string | undefined = patientLookup?.abha_number ?? undefined

  if (abhaNumber) injectAbhaIdentifier(entries, abhaNumber)

  // Reserve an upload_id up front so we can stamp it onto every resource.
  const uploadId = randomUUID()

  const tags: ResourceTag[] = [
    { system: 'urn:hospital', code: 'self' },
    { system: 'urn:upload', code: uploadId },
  ]
  if (abhaNumber) tags.push({ system: 'urn:abha', code: abhaNumber })
  tagBundleResources(entries, tags)

  const batchBundle = toBatchBundle({ ...bundle, entry: entries })

  // Save original file to storage. If storage is not configured, log and continue
  // — the FHIR bundle is still stored. The upload row is only inserted on success.
  const storagePath = buildStoragePath(auth.profile.user_id, uploadId, originalFilename)
  const storeOriginal = await uploadOriginalFile(storagePath, content, contentType)
  if (!storeOriginal.ok) {
    console.error('[patient/upload] storage error:', storeOriginal.error)
  }

  let storedBundle: object
  try {
    storedBundle = await storeFhirBundle(batchBundle)
  } catch (err) {
    console.error('[patient/upload] store error:', err)
    return NextResponse.json({ error: 'failed to store FHIR bundle' }, { status: 502 })
  }

  // Backfill fhir_patient_id if not yet set + count accepted resources.
  let fhirPatientId: string | null = null
  let acceptedCount = 0
  try {
    const responseBundle = storedBundle as { entry?: { response?: { status?: string; location?: string } }[] }
    for (const e of responseBundle.entry ?? []) {
      if (e.response?.status?.startsWith('2')) acceptedCount++
    }
    const patientLocation = responseBundle.entry?.find((e) =>
      e.response?.location?.startsWith('Patient/'),
    )?.response?.location
    if (patientLocation) fhirPatientId = patientLocation.split('/')[1] ?? null

    const { data: patientRow } = await adminClient
      .from('patients')
      .select('fhir_patient_id')
      .eq('user_id', auth.profile.user_id)
      .single()
    if (!patientRow?.fhir_patient_id && fhirPatientId) {
      await adminClient
        .from('patients')
        .update({ fhir_patient_id: fhirPatientId })
        .eq('user_id', auth.profile.user_id)
    }
  } catch (err) {
    console.error('[patient/upload] post-store error:', err)
  }

  // Record upload row last (only when storage succeeded; otherwise we cannot
  // surface the original file in the dashboard so the row would be misleading).
  if (storeOriginal.ok) {
    const { error: insertErr } = await adminClient.from('medical_uploads').insert({
      upload_id: uploadId,
      patient_user_id: auth.profile.user_id,
      uploaded_by: auth.profile.user_id,
      uploader_role: auth.profile.role,
      hospital_id: null,
      abha_number: abhaNumber ?? null,
      input_type: inputType,
      original_filename: originalFilename,
      storage_path: storagePath,
      content_type: contentType,
      file_size: content.length,
      fhir_patient_id: fhirPatientId,
      resource_count: acceptedCount,
    })
    if (insertErr) {
      console.error('[patient/upload] medical_uploads insert error:', insertErr)
    }
  }

  return NextResponse.json({ ok: true, upload_id: uploadId, accepted: acceptedCount }, { status: 201 })
}
