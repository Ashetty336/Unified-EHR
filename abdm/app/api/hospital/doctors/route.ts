import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// GET /api/hospital/doctors
// Returns doctors linked to the authenticated hospital.
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'hospital')
  if (!auth.ok) return auth.response

  // Resolve hospital_id for this user
  const { data: hospital, error: hErr } = await adminClient
    .from('hospitals')
    .select('hospital_id')
    .eq('user_id', auth.profile.user_id)
    .single()

  if (hErr || !hospital) {
    return NextResponse.json({ error: 'hospital profile not found' }, { status: 404 })
  }

  const { data, error } = await adminClient
    .from('doctors')
    .select(`
      doctor_id,
      specialization,
      license_number,
      approval_status,
      created_at,
      users!inner ( full_name, email )
    `)
    .eq('hospital_id', hospital.hospital_id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'failed to fetch doctors' }, { status: 500 })
  }

  return NextResponse.json(data)
}
