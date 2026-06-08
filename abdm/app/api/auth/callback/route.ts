import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

const DASHBOARD: Record<string, string> = {
  patient: '/dashboard/patient',
  doctor: '/dashboard/doctor',
  hospital: '/dashboard/hospital',
  admin: '/dashboard/admin',
}

// GET /api/auth/callback?code=...
// Handles OAuth callback (Google etc). Auto-creates patient profile on first OAuth login.
// Redirects to role dashboard on success.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=no_code`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth/login?error=oauth_failed`)
  }

  const userId = data.user.id
  const email = data.user.email!

  // Check if profile exists
  const { data: existingUser } = await adminClient
    .from('users')
    .select('user_id, role')
    .eq('user_id', userId)
    .single()

  if (existingUser) {
    // Returning user — go straight to dashboard
    const dest = DASHBOARD[existingUser.role] ?? '/dashboard/patient'
    return NextResponse.redirect(`${origin}${dest}`)
  }

  // First OAuth login — create patient profile
  const { error: userErr } = await adminClient.from('users').insert({
    user_id: userId,
    email,
    role: 'patient',
    full_name: data.user.user_metadata?.full_name ?? null,
  })

  if (userErr) {
    return NextResponse.redirect(`${origin}/auth/login?error=profile_failed`)
  }

  const { data: abhaNumber, error: abhaErr } = await adminClient.rpc('generate_abha_number')

  if (abhaErr || !abhaNumber) {
    return NextResponse.redirect(`${origin}/auth/login?error=abha_failed`)
  }

  const abhaAddress = `${abhaNumber}@abdm`

  const { data: patient, error: patientErr } = await adminClient
    .from('patients')
    .insert({ user_id: userId, abha_number: abhaNumber, abha_address: abhaAddress })
    .select('patient_id')
    .single()

  if (patientErr || !patient) {
    return NextResponse.redirect(`${origin}/auth/login?error=patient_insert_failed`)
  }

  await adminClient.from('abha_registry').insert({
    abha_number: abhaNumber,
    abha_address: abhaAddress,
    patient_id: patient.patient_id,
  })

  return NextResponse.redirect(`${origin}/dashboard/patient`)
}
