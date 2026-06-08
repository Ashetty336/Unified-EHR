import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

// GET /api/me
// Returns current user's profile + role-specific data.
// Requires valid session cookie.
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { data: profile, error: profileErr } = await adminClient
    .from('users')
    .select('user_id, email, role, full_name, phone, created_at')
    .eq('user_id', user.id)
    .single()

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'profile not found' }, { status: 404 })
  }

  let roleProfile = null

  if (profile.role === 'patient') {
    const { data } = await adminClient
      .from('patients')
      .select('patient_id, abha_number, abha_address, date_of_birth, gender, blood_group')
      .eq('user_id', user.id)
      .single()
    roleProfile = data
  } else if (profile.role === 'doctor') {
    const { data } = await adminClient
      .from('doctors')
      .select('doctor_id, hospital_id, specialization, license_number, approval_status, hospitals!inner(name, registration_no, address, phone, approval_status)')
      .eq('user_id', user.id)
      .single()
    roleProfile = data
  } else if (profile.role === 'hospital') {
    const { data } = await adminClient
      .from('hospitals')
      .select('hospital_id, name, address, phone, registration_no, approval_status')
      .eq('user_id', user.id)
      .single()
    roleProfile = data
  }

  return NextResponse.json({ ...profile, roleProfile })
}
