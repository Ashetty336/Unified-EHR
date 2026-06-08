import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// GET /api/consents
// Patient: see all their consents.
// Doctor/hospital: see consents granted to them.
// Optional query: ?status=approved|revoked|expired
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'patient', 'doctor', 'hospital')
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status')

  if (auth.profile.role === 'patient') {
    const { data: patient, error: patientErr } = await adminClient
      .from('patients')
      .select('patient_id')
      .eq('user_id', auth.profile.user_id)
      .single()

    if (patientErr || !patient) {
      return NextResponse.json({ error: 'patient profile not found' }, { status: 404 })
    }

    let query = adminClient
      .from('consents')
      .select('*, users!requester_id(full_name, email, role)')
      .eq('patient_id', patient.patient_id)
      .order('created_at', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Doctor/hospital
  let query = adminClient
    .from('consents')
    .select('*, patients!patient_id(abha_number, abha_address)')
    .eq('requester_id', auth.profile.user_id)
    .order('created_at', { ascending: false })

  if (statusFilter) query = query.eq('status', statusFilter)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
