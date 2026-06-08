import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { validateConsent } from '@/lib/consent'
import { adminClient } from '@/lib/supabase/admin'
import { fetchResourcesByTag } from '@/lib/fhir/hapi'
import { transformFhirBundle } from '@/lib/fhir/transform'
import { auditLog } from '@/lib/audit'

type Params = { params: Promise<{ abha: string; uploadId: string }> }

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

// GET /api/fhir/records/by-abha/[abha]/uploads/[uploadId]/fhir
// Cross-hospital read: fetches FHIR resources tagged with this upload, requires
// an approved consent for the patient identified by ABHA.
export async function GET(req: NextRequest, { params }: Params) {
  const { abha, uploadId } = await params

  const auth = await requireRole(req, 'doctor', 'hospital', 'admin')
  if (!auth.ok) return auth.response

  const { data: patientRow } = await adminClient
    .from('patients')
    .select('patient_id, user_id')
    .eq('abha_number', abha)
    .single()
  if (!patientRow?.user_id) {
    return NextResponse.json({ error: 'patient not found for ABHA' }, { status: 404 })
  }

  let consentId: string | undefined
  if (auth.profile.role !== 'admin') {
    const consent = await validateConsent(auth.profile.user_id, patientRow.patient_id as string)
    if (!consent.valid) {
      return NextResponse.json({ error: consent.reason }, { status: 403 })
    }
    consentId = consent.consent_id
  }

  // Verify upload actually belongs to this patient.
  const { data: upload } = await adminClient
    .from('medical_uploads')
    .select('upload_id, patient_user_id')
    .eq('upload_id', uploadId)
    .single()
  if (!upload || upload.patient_user_id !== patientRow.user_id) {
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

    auditLog({
      accessed_by: auth.profile.user_id,
      accessor_role: auth.profile.role,
      patient_id: patientRow.patient_id as string,
      action: 'fhir_read',
      resource_type: 'Bundle',
      consent_id: consentId,
      user_agent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json(records)
  } catch (err) {
    console.error('[fhir/records/by-abha/uploads/fhir] fetch error:', err)
    return NextResponse.json({ error: 'failed to fetch FHIR records' }, { status: 502 })
  }
}
