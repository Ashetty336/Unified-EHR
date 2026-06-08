import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'
import { fetchResourcesByTag } from '@/lib/fhir/hapi'
import { transformFhirBundle } from '@/lib/fhir/transform'

type Params = { params: Promise<{ uploadId: string }> }

const RESOURCE_TYPES = [
  'Observation',
  'MedicationRequest',
  'MedicationStatement',
  'Condition',
  'AllergyIntolerance',
  'Procedure',
  'DiagnosticReport',
  'Encounter',
  'Immunization',
] as const

type FhirBundle = { entry?: { resource?: Record<string, unknown> }[] }

// GET /api/patient/uploads/[uploadId]/fhir
// Returns FHIR resources tagged with this specific upload, transformed for UI.
export async function GET(req: NextRequest, { params }: Params) {
  const { uploadId } = await params

  const auth = await requireRole(req, 'patient')
  if (!auth.ok) return auth.response

  // Confirm the upload belongs to this patient.
  const { data: upload, error } = await adminClient
    .from('medical_uploads')
    .select('upload_id, patient_user_id, fhir_patient_id')
    .eq('upload_id', uploadId)
    .single()

  if (error || !upload || upload.patient_user_id !== auth.profile.user_id) {
    return NextResponse.json({ error: 'upload not found' }, { status: 404 })
  }

  const tag = { system: 'urn:upload', code: uploadId }

  try {
    const [patientBundleRaw, ...rest] = await Promise.all([
      fetchResourcesByTag('Patient', tag),
      ...RESOURCE_TYPES.map((rt) => fetchResourcesByTag(rt, tag)),
    ])

    const patientBundle = patientBundleRaw as FhirBundle
    const patientResource = patientBundle.entry?.[0]?.resource ?? null

    const bundles = RESOURCE_TYPES.map((rt, idx) => ({
      resourceType: rt,
      bundle: rest[idx] as FhirBundle,
    }))

    const records = transformFhirBundle(patientResource, bundles)
    return NextResponse.json(records)
  } catch (err) {
    console.error('[patient/uploads/fhir] fetch error:', err)
    return NextResponse.json({ error: 'failed to fetch FHIR records' }, { status: 502 })
  }
}
