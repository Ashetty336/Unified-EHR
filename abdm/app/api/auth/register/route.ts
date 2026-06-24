import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { buildCertificatePath, uploadOriginalFile } from '@/lib/storage'

// POST /api/auth/register
// Creates user account + role profile, then sends OTP so user can log in immediately.
//
// Patient: JSON body { email, role: 'patient', full_name?, phone? }.
// Doctor & hospital: multipart/form-data so the verification certificate PDF can
//   be uploaded at signup. Text fields plus a `certificate` File part.
//   doctor:   { email, role, full_name, hospital_id, specialization?, license_number, certificate }
//   hospital: { email, role, name, address?, phone?, official_email?, registration_no, certificate }
export async function POST(req: NextRequest) {
  // Parse either JSON (patient) or multipart (doctor/hospital with certificate).
  const contentType = req.headers.get('content-type') ?? ''
  const isMultipart = contentType.includes('multipart/form-data')

  const body: Record<string, string> = {}
  let certificate: File | null = null

  if (isMultipart) {
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 })
    }
    for (const [key, value] of formData.entries()) {
      if (key === 'certificate') {
        if (value && typeof value !== 'string') certificate = value as File
      } else if (typeof value === 'string') {
        body[key] = value
      }
    }
  } else {
    try {
      Object.assign(body, await req.json())
    } catch {
      return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
    }
  }

  const { email, role } = body

  if (!email || !role) {
    return NextResponse.json({ error: 'email and role required' }, { status: 400 })
  }

  if (!['patient', 'doctor', 'hospital'].includes(role)) {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 })
  }

  if (role === 'doctor' && !body.hospital_id) {
    return NextResponse.json({ error: 'doctor must belong to a hospital' }, { status: 400 })
  }

  if (role === 'hospital' && !body.name) {
    return NextResponse.json({ error: 'hospital name required' }, { status: 400 })
  }

  // Verification certificate is mandatory for doctor + hospital (anti-fraud).
  if (role === 'doctor' || role === 'hospital') {
    if (!certificate) {
      return NextResponse.json({ error: 'certificate PDF is required' }, { status: 400 })
    }
    const ctype = certificate.type || 'application/pdf'
    if (!ctype.includes('pdf')) {
      return NextResponse.json({ error: 'certificate must be a PDF' }, { status: 400 })
    }
  }
  if (role === 'doctor' && !body.license_number) {
    return NextResponse.json({ error: 'license number required' }, { status: 400 })
  }
  if (role === 'hospital' && !body.registration_no) {
    return NextResponse.json({ error: 'registration number required' }, { status: 400 })
  }

  // Check if email already registered in our users table
  const { data: existing } = await adminClient
    .from('users')
    .select('user_id, role')
    .eq('email', email)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'email already registered' }, { status: 409 })
  }

  // Create confirmed Supabase auth user (no invite email, no magic link)
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true, // mark confirmed so OTP flow works without separate confirm step
    user_metadata: { full_name: body.full_name ?? null },
  })

  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? 'auth user creation failed' }, { status: 500 })
  }

  const userId = created.user.id

  // Insert users row
  const { error: userErr } = await adminClient.from('users').insert({
    user_id: userId,
    email,
    role,
    full_name: body.full_name ?? null,
    phone: body.phone ?? null,
  })

  if (userErr) {
    // Rollback auth user
    await adminClient.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: userErr.message }, { status: 500 })
  }

  // Insert role-specific row
  let abhaNumber: string | null = null
  let abhaAddress: string | null = null

  if (role === 'patient') {
    const { data: abha, error: abhaErr } = await adminClient.rpc('generate_abha_number')

    if (abhaErr || !abha) {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: 'ABHA generation failed' }, { status: 500 })
    }

    abhaNumber = abha
    abhaAddress = `${abha}@abdm`

    const { data: patient, error: patientErr } = await adminClient
      .from('patients')
      .insert({ user_id: userId, abha_number: abhaNumber, abha_address: abhaAddress })
      .select('patient_id')
      .single()

    if (patientErr || !patient) {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: patientErr?.message ?? 'patient insert failed' }, { status: 500 })
    }

    await adminClient.from('abha_registry').insert({
      abha_number: abhaNumber,
      abha_address: abhaAddress,
      patient_id: patient.patient_id,
    })
  }

  if (role === 'doctor') {
    const { data: hospital, error: hospitalErr } = await adminClient
      .from('hospitals')
      .select('hospital_id, approval_status')
      .eq('hospital_id', body.hospital_id)
      .single()

    if (hospitalErr || !hospital) {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: 'hospital not found' }, { status: 404 })
    }

    if (hospital.approval_status !== 'approved') {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: 'hospital not approved' }, { status: 403 })
    }

    const certPath = await storeCertificate(userId, 'doctor', certificate)
    if (!certPath.ok) {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: certPath.error }, { status: 500 })
    }

    const { error: doctorErr } = await adminClient.from('doctors').insert({
      user_id: userId,
      hospital_id: body.hospital_id,
      specialization: body.specialization ?? null,
      license_number: body.license_number ?? null,
      certificate_path: certPath.path,
    })

    if (doctorErr) {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: doctorErr.message }, { status: 500 })
    }
  }

  if (role === 'hospital') {
    const certPath = await storeCertificate(userId, 'hospital', certificate)
    if (!certPath.ok) {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: certPath.error }, { status: 500 })
    }

    const { error: hospitalErr } = await adminClient.from('hospitals').insert({
      user_id: userId,
      name: body.name,
      address: body.address ?? null,
      phone: body.phone ?? null,
      official_email: body.official_email ?? email,
      registration_no: body.registration_no ?? null,
      certificate_path: certPath.path,
    })

    if (hospitalErr) {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: hospitalErr.message }, { status: 500 })
    }
  }

  // Send OTP via signInWithOtp — user already exists + confirmed so Supabase sends 6-digit code
  const supabase = await createClient()
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  })

  if (otpErr) {
    return NextResponse.json({ error: 'account created but OTP send failed: ' + otpErr.message }, { status: 500 })
  }

  return NextResponse.json({
    message: 'registered',
    abha_number: abhaNumber,
    abha_address: abhaAddress,
  })
}

// Upload the verification certificate to storage, keyed by user_id.
// Caller guarantees `file` is non-null for doctor/hospital roles.
async function storeCertificate(
  userId: string,
  kind: 'hospital' | 'doctor',
  file: File | null,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!file) return { ok: false, error: 'certificate PDF is required' }
  const buffer = Buffer.from(await file.arrayBuffer())
  const path = buildCertificatePath(userId, kind, file.name || 'certificate.pdf')
  const result = await uploadOriginalFile(path, buffer, file.type || 'application/pdf')
  if (!result.ok) return { ok: false, error: `certificate upload failed: ${result.error}` }
  return { ok: true, path }
}
