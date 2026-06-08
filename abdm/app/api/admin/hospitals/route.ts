import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// GET /api/admin/hospitals?status=pending|approved|rejected
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (!auth.ok) return auth.response

  const status = req.nextUrl.searchParams.get('status') ?? 'pending'
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'status must be pending, approved, or rejected' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('hospitals')
    .select('hospital_id, name, address, phone, registration_no, approval_status, created_at, approved_at')
    .eq('approval_status', status)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[admin/hospitals] query failed:', error)
    return NextResponse.json({ error: `failed to fetch hospitals: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
