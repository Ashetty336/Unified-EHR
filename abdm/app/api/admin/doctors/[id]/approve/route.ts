import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

// POST /api/admin/doctors/[id]/approve
// Body: { action: 'approved' | 'rejected' }
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params

  const auth = await requireRole(req, 'admin')
  if (!auth.ok) return auth.response

  let body: { action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { action } = body
  if (action !== 'approved' && action !== 'rejected') {
    return NextResponse.json({ error: 'action must be approved or rejected' }, { status: 400 })
  }

  const { data: doctor, error: fetchErr } = await adminClient
    .from('doctors')
    .select('doctor_id, approval_status, hospital_id')
    .eq('doctor_id', id)
    .single()

  if (fetchErr || !doctor) {
    return NextResponse.json({ error: 'doctor not found' }, { status: 404 })
  }

  if (doctor.approval_status !== 'pending') {
    return NextResponse.json(
      { error: `doctor already ${doctor.approval_status}` },
      { status: 409 }
    )
  }

  // Doctor's hospital must be approved before doctor can be approved
  if (action === 'approved') {
    const { data: hospital } = await adminClient
      .from('hospitals')
      .select('approval_status')
      .eq('hospital_id', doctor.hospital_id)
      .single()

    if (!hospital || hospital.approval_status !== 'approved') {
      return NextResponse.json(
        { error: 'cannot approve doctor — hospital not yet approved' },
        { status: 422 }
      )
    }
  }

  const { error: updateErr } = await adminClient
    .from('doctors')
    .update({
      approval_status: action,
      approved_by: auth.profile.user_id,
      approved_at: new Date().toISOString(),
    })
    .eq('doctor_id', id)

  if (updateErr) {
    return NextResponse.json({ error: 'failed to update doctor' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, doctor_id: id, status: action })
}
