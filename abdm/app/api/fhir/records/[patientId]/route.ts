import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { validateConsent } from '@/lib/consent'
import { fetchPatientResources } from '@/lib/fhir/hapi'
import { transformFhirBundle } from '@/lib/fhir/transform'
import { auditLog } from '@/lib/audit'
import { adminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ patientId: string }> }

// GET /api/fhir/records/[patientId]
// Requires: doctor or admin session + valid consent for the patient.
// patientId here is the internal UUID (not ABHA number, not FHIR ID).
export async function GET(req: NextRequest, { params }: Params) {
  const { patientId } = await params

  const auth = await requireRole(req, 'doctor', 'admin')
  if (!auth.ok) return auth.response

  // Look up patient row first — need PK for consent check.
  const { data: patientRow, error: patientErr } = await adminClient
    .from('patients')
    .select('patient_id, fhir_patient_id')
    .eq('user_id', patientId)
    .single()

  if (patientErr || !patientRow?.fhir_patient_id) {
    return NextResponse.json({ error: 'patient has no FHIR record' }, { status: 404 })
  }

  // Doctors need consent; admins skip consent check.
  // consents.patient_id references patients.patient_id (PK), not the auth user_id.
  let consentId: string | undefined
  if (auth.profile.role === 'doctor') {
    const consentCheck = await validateConsent(auth.profile.user_id, patientRow.patient_id)
    if (!consentCheck.valid) {
      return NextResponse.json({ error: consentCheck.reason }, { status: 403 })
    }
    consentId = consentCheck.consent_id
  }

  const fhirPatientId: string = patientRow.fhir_patient_id

  try {
    // Fetch all relevant resource types in parallel
    const [patientResource, obsBunde, medBundle] = await Promise.all([
      fetchPatientResources(fhirPatientId, 'Patient'),
      fetchPatientResources(fhirPatientId, 'Observation'),
      fetchPatientResources(fhirPatientId, 'MedicationRequest'),
    ])

    const records = transformFhirBundle(
      patientResource as Record<string, unknown>,
      [
        { resourceType: 'Observation', bundle: obsBunde as { entry?: { resource?: Record<string, unknown> }[] } },
        { resourceType: 'MedicationRequest', bundle: medBundle as { entry?: { resource?: Record<string, unknown> }[] } },
      ]
    )

    // Audit — fire and forget
    auditLog({
      accessed_by: auth.profile.user_id,
      accessor_role: auth.profile.role,
      patient_id: patientRow.patient_id,
      action: 'fhir_read',
      resource_type: 'Bundle',
      consent_id: consentId,
      user_agent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json(records)
  } catch (err) {
    console.error('[fhir/records] fetch error:', err)
    return NextResponse.json({ error: 'failed to fetch FHIR records' }, { status: 502 })
  }
}
