import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// POST /api/consents/[id]/revoke
// Patient revokes an active consent. Immediate effect.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, 'patient')
  if (!auth.ok) return auth.response

  const { id } = await params

  const { data: patient, error: patientErr } = await adminClient
    .from('patients')
    .select('patient_id')
    .eq('user_id', auth.profile.user_id)
    .single()

  if (patientErr || !patient) {
    return NextResponse.json({ error: 'patient profile not found' }, { status: 404 })
  }

  // Fetch consent — must belong to this patient
  const { data: consent, error: fetchErr } = await adminClient
    .from('consents')
    .select('consent_id, status')
    .eq('consent_id', id)
    .eq('patient_id', patient.patient_id)
    .single()

  if (fetchErr || !consent) {
    return NextResponse.json({ error: 'consent not found' }, { status: 404 })
  }

  if (consent.status !== 'approved') {
    return NextResponse.json({ error: `cannot revoke consent with status: ${consent.status}` }, { status: 409 })
  }

  const { error: updateErr } = await adminClient
    .from('consents')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('consent_id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ message: 'consent revoked' })
}
