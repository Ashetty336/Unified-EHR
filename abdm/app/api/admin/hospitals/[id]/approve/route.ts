import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

// POST /api/admin/hospitals/[id]/approve
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

  const { data: hospital, error: fetchErr } = await adminClient
    .from('hospitals')
    .select('hospital_id, approval_status')
    .eq('hospital_id', id)
    .single()

  if (fetchErr || !hospital) {
    return NextResponse.json({ error: 'hospital not found' }, { status: 404 })
  }

  if (hospital.approval_status !== 'pending') {
    return NextResponse.json(
      { error: `hospital already ${hospital.approval_status}` },
      { status: 409 }
    )
  }

  const { error: updateErr } = await adminClient
    .from('hospitals')
    .update({
      approval_status: action,
      approved_by: auth.profile.user_id,
      approved_at: new Date().toISOString(),
    })
    .eq('hospital_id', id)

  if (updateErr) {
    return NextResponse.json({ error: 'failed to update hospital' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, hospital_id: id, status: action })
}
