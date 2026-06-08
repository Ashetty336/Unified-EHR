import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// GET /api/doctor/patient-lookup?abha_number=XX-XXXX-XXXX-XXXX
// Doctor resolves an ABHA number to the patient's internal user_id.
// Returns minimal profile — no PHI, just enough to call /api/fhir/records/[patientId].
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'doctor')
  if (!auth.ok) return auth.response

  const abha_number = req.nextUrl.searchParams.get('abha_number')
  if (!abha_number) {
    return NextResponse.json({ error: 'abha_number required' }, { status: 400 })
  }

  const { data: abha, error: abhaErr } = await adminClient
    .from('abha_registry')
    .select('patient_id, is_active')
    .eq('abha_number', abha_number)
    .single()

  if (abhaErr || !abha) {
    return NextResponse.json({ error: 'patient not found' }, { status: 404 })
  }

  if (!abha.is_active) {
    return NextResponse.json({ error: 'patient ABHA inactive' }, { status: 400 })
  }

  const { data: patient, error: patientErr } = await adminClient
    .from('patients')
    .select('user_id, abha_address')
    .eq('patient_id', abha.patient_id)
    .single()

  if (patientErr || !patient) {
    return NextResponse.json({ error: 'patient profile not found' }, { status: 404 })
  }

  return NextResponse.json({
    user_id: patient.user_id,
    abha_address: patient.abha_address,
    abha_number,
  })
}
