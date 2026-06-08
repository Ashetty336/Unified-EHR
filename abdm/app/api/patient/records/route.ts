import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { fetchPatientResources } from '@/lib/fhir/hapi'
import { transformFhirBundle } from '@/lib/fhir/transform'
import { adminClient } from '@/lib/supabase/admin'

// GET /api/patient/records
// Patient fetches their own FHIR records. No consent required — it's their own data.
export async function GET(req: Request) {
  const auth = await requireRole(req as never, 'patient')
  if (!auth.ok) return auth.response

  const { data: patient, error: patientErr } = await adminClient
    .from('patients')
    .select('fhir_patient_id')
    .eq('user_id', auth.profile.user_id)
    .single()

  if (patientErr || !patient?.fhir_patient_id) {
    return NextResponse.json({ error: 'no FHIR record found — upload a document first' }, { status: 404 })
  }

  const fhirPatientId: string = patient.fhir_patient_id

  try {
    const [patientResource, obsBundle, medBundle] = await Promise.all([
      fetchPatientResources(fhirPatientId, 'Patient'),
      fetchPatientResources(fhirPatientId, 'Observation'),
      fetchPatientResources(fhirPatientId, 'MedicationRequest'),
    ])

    const records = transformFhirBundle(
      patientResource as Record<string, unknown>,
      [
        { resourceType: 'Observation', bundle: obsBundle as { entry?: { resource?: Record<string, unknown> }[] } },
        { resourceType: 'MedicationRequest', bundle: medBundle as { entry?: { resource?: Record<string, unknown> }[] } },
      ]
    )

    return NextResponse.json(records)
  } catch (err) {
    console.error('[patient/records] fetch error:', err)
    return NextResponse.json({ error: 'failed to fetch FHIR records' }, { status: 502 })
  }
}
