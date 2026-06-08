import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

// POST /api/auth/verify-otp
// Body: { email: string, token: string }
// Verifies OTP, creates profile row on first login.
// For patients: also generates ABHA number + inserts into patients + abha_registry.
export async function POST(req: NextRequest) {
  const { email, token } = await req.json()

  if (!email || !token) {
    return NextResponse.json({ error: 'email and token required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: sessionData, error: authError } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (authError || !sessionData.user) {
    return NextResponse.json({ error: authError?.message ?? 'invalid OTP' }, { status: 401 })
  }

  const userId = sessionData.user.id

  // Check if profile already exists
  const { data: existingUser } = await adminClient
    .from('users')
    .select('user_id, role')
    .eq('user_id', userId)
    .single()

  if (existingUser) {
    return NextResponse.json({ user: existingUser, firstLogin: false })
  }

  // First login — profile not yet created. Role is set via /api/auth/register.
  // If no register was called (e.g. OAuth flow or direct OTP without register),
  // default to patient role.
  const role = 'patient'

  const { error: insertError } = await adminClient.from('users').insert({
    user_id: userId,
    email,
    role,
    full_name: sessionData.user.user_metadata?.full_name ?? null,
  })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Generate ABHA for patient
  const abhaResult = await setupPatientAbha(userId)
  if (abhaResult.error) {
    return NextResponse.json({ error: abhaResult.error }, { status: 500 })
  }

  return NextResponse.json({ user: { user_id: userId, role }, firstLogin: true })
}

async function setupPatientAbha(userId: string) {
  // Generate unique ABHA number via DB function
  const { data: abhaNumber, error: abhaErr } = await adminClient
    .rpc('generate_abha_number')

  if (abhaErr || !abhaNumber) {
    return { error: abhaErr?.message ?? 'ABHA generation failed' }
  }

  const abhaAddress = `${abhaNumber}@abdm`

  // Insert patient row
  const { data: patient, error: patientErr } = await adminClient
    .from('patients')
    .insert({ user_id: userId, abha_number: abhaNumber, abha_address: abhaAddress })
    .select('patient_id')
    .single()

  if (patientErr || !patient) {
    return { error: patientErr?.message ?? 'patient insert failed' }
  }

  // Insert into abha_registry
  const { error: registryErr } = await adminClient.from('abha_registry').insert({
    abha_number: abhaNumber,
    abha_address: abhaAddress,
    patient_id: patient.patient_id,
  })

  if (registryErr) {
    return { error: registryErr.message }
  }

  return { abhaNumber, abhaAddress }
}
