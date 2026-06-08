import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { validateConsent } from '@/lib/consent'
import { fetchPatientResources, findPatientByAbha } from '@/lib/fhir/hapi'
import { transformFhirBundle } from '@/lib/fhir/transform'
import { auditLog } from '@/lib/audit'
import { adminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ abha: string }> }

const RESOURCE_TYPES = [
  'Observation',
  'Condition',
  'AllergyIntolerance',
  'Procedure',
  'MedicationStatement',
  'DiagnosticReport',
  'Encounter',
  'Immunization',
] as const

type FhirBundle = { entry?: { resource?: Record<string, unknown> }[] }

// GET /api/fhir/records/by-abha/[abha]
// Cross-hospital read. Caller (doctor or hospital) must have an approved consent
// for the patient identified by ABHA number.
export async function GET(req: NextRequest, { params }: Params) {
  const { abha } = await params

  const auth = await requireRole(req, 'doctor', 'hospital', 'admin')
  if (!auth.ok) return auth.response

  // Resolve ABHA → patients row (need both PK and user_id)
  const { data: patientRow, error: patientErr } = await adminClient
    .from('patients')
    .select('patient_id, user_id, fhir_patient_id')
    .eq('abha_number', abha)
    .single()

  if (patientErr || !patientRow?.user_id) {
    return NextResponse.json({ error: 'patient not found for ABHA' }, { status: 404 })
  }

  const patientUserId: string = patientRow.user_id
  const patientPk: string = patientRow.patient_id

  // Admins skip consent. Doctors and hospitals must have a valid approved consent.
  // validateConsent matches against consents.patient_id which references patients.patient_id (PK).
  let consentId: string | undefined
  if (auth.profile.role !== 'admin') {
    const consentCheck = await validateConsent(auth.profile.user_id, patientPk)
    if (!consentCheck.valid) {
      return NextResponse.json({ error: consentCheck.reason }, { status: 403 })
    }
    consentId = consentCheck.consent_id
  }

  // Resolve FHIR Patient ID — prefer Supabase backfill, fall back to ABHA identifier search.
  let fhirPatientId = patientRow.fhir_patient_id as string | null
  let patientResource: object | null = null

  // After consent is granted the requester sees every resource the patient has,
  // regardless of which hospital uploaded it. Filter by the ABHA tag (which is
  // stamped on every uploaded resource) instead of the requester's hospital tag.
  const tagFilter = { system: 'urn:abha', code: abha }

  // Re-resolve Patient by ABHA. The patient may have multiple Patient resources
  // across hospitals — take the most recently updated one as the canonical id.
  const latestPatient = await findPatientByAbha(abha)
  if (latestPatient) {
    fhirPatientId = latestPatient.id
    patientResource = latestPatient.resource
    if (fhirPatientId !== patientRow.fhir_patient_id) {
      await adminClient
        .from('patients')
        .update({ fhir_patient_id: fhirPatientId })
        .eq('user_id', patientUserId)
    }
  }

  if (!fhirPatientId) {
    return NextResponse.json({ error: 'no FHIR record stored for this patient' }, { status: 404 })
  }

  try {
    if (!patientResource) {
      patientResource = await fetchPatientResources(fhirPatientId, 'Patient', tagFilter)
    }

    const bundles = await Promise.all(
      RESOURCE_TYPES.map(async (rt) => ({
        resourceType: rt,
        bundle: (await fetchPatientResources(fhirPatientId!, rt, tagFilter)) as FhirBundle,
      })),
    )

    const records = transformFhirBundle(patientResource as Record<string, unknown>, bundles)

    auditLog({
      accessed_by: auth.profile.user_id,
      accessor_role: auth.profile.role,
      patient_id: patientPk,
      action: 'fhir_read',
      resource_type: 'Bundle',
      consent_id: consentId,
      user_agent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json(records)
  } catch (err) {
    console.error('[fhir/records/by-abha] fetch error:', err)
    return NextResponse.json({ error: 'failed to fetch FHIR records' }, { status: 502 })
  }
}
