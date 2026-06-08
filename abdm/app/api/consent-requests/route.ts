import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// POST /api/consent-requests
// Doctor or hospital initiates a consent request using patient's ABHA number.
// Body: { abha_number, access_type, resource_scope?, requested_duration?, purpose? }
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'doctor', 'hospital')
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { abha_number, access_type, resource_scope, requested_duration, purpose } = body

  if (!abha_number || !access_type) {
    return NextResponse.json({ error: 'abha_number and access_type required' }, { status: 400 })
  }

  if (!['full', 'resource_level'].includes(access_type)) {
    return NextResponse.json({ error: 'access_type must be full or resource_level' }, { status: 400 })
  }

  if (access_type === 'resource_level' && (!resource_scope || resource_scope.length === 0)) {
    return NextResponse.json({ error: 'resource_scope required for resource_level access' }, { status: 400 })
  }

  // Verify ABHA exists
  const { data: abha, error: abhaErr } = await adminClient
    .from('abha_registry')
    .select('patient_id, is_active')
    .eq('abha_number', abha_number)
    .single()

  if (abhaErr || !abha) {
    return NextResponse.json({ error: 'patient not found' }, { status: 404 })
  }

  if (!abha.is_active) {
    return NextResponse.json({ error: 'patient ABHA inactive' }, { status: 400 })
  }

  // Check for existing pending request from same requester for same patient.
  // Use a plain select (not .single()) — .single() returns an error when more
  // than one pending row already exists, which would null out `existing` and
  // let yet another duplicate through.
  const { data: existing } = await adminClient
    .from('consent_requests')
    .select('request_id')
    .eq('requester_id', auth.profile.user_id)
    .eq('abha_number', abha_number)
    .eq('status', 'pending')
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'pending request already exists for this patient' }, { status: 409 })
  }

  const { data: request, error: insertErr } = await adminClient
    .from('consent_requests')
    .insert({
      requester_id: auth.profile.user_id,
      requester_type: auth.profile.role as 'doctor' | 'hospital',
      abha_number,
      access_type,
      resource_scope: resource_scope ?? [],
      requested_duration: requested_duration ?? 30,
      purpose: purpose ?? null,
    })
    .select()
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json(request, { status: 201 })
}

// GET /api/consent-requests
// Doctor/hospital: see their own requests.
// Patient: see requests addressed to them (via abha_number).
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'doctor', 'hospital', 'patient')
  if (!auth.ok) return auth.response

  if (auth.profile.role === 'doctor' || auth.profile.role === 'hospital') {
    const { data, error } = await adminClient
      .from('consent_requests')
      .select('*')
      .eq('requester_id', auth.profile.user_id)
      .order('requested_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Patient: find their ABHA number first
  const { data: patient, error: patientErr } = await adminClient
    .from('patients')
    .select('abha_number')
    .eq('user_id', auth.profile.user_id)
    .single()

  if (patientErr || !patient) {
    return NextResponse.json({ error: 'patient profile not found' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status') // e.g. ?status=pending

  let query = adminClient
    .from('consent_requests')
    .select('*, users!requester_id(full_name, email, role)')
    .eq('abha_number', patient.abha_number)
    .order('requested_at', { ascending: false })

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
