import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// GET /api/admin/doctors?status=pending|approved|rejected
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (!auth.ok) return auth.response

  const status = req.nextUrl.searchParams.get('status') ?? 'pending'
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'status must be pending, approved, or rejected' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('doctors')
    .select(`
      doctor_id,
      specialization,
      license_number,
      approval_status,
      created_at,
      approved_at,
      users!doctors_user_id_fkey!inner ( full_name, email ),
      hospitals!inner ( name, registration_no )
    `)
    .eq('approval_status', status)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[admin/doctors] query failed:', error)
    return NextResponse.json({ error: `failed to fetch doctors: ${error.message}` }, { status: 500 })
  }

  // Supabase types to-one embeds as arrays; flatten to objects the client expects.
  const flattened = (data ?? []).map((d) => {
    const row = d as Record<string, unknown>
    const pick = (v: unknown) => (Array.isArray(v) ? v[0] : v)
    return { ...row, users: pick(row.users), hospitals: pick(row.hospitals) }
  })

  return NextResponse.json(flattened)
}
