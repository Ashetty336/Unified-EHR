import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'
import { resolveRequesterHospitalCode, transferPatientResourcesToHospital } from '@/lib/fhir/transfer'

// POST /api/consent-requests/[id]
// Patient approves or rejects a consent request.
// Body: { action: 'approve' | 'reject', duration_days? (overrides requested_duration) }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, 'patient')
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await req.json()
  const { action, duration_days } = body

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  // Fetch the request + verify it belongs to this patient
  const { data: patient, error: patientErr } = await adminClient
    .from('patients')
    .select('patient_id, abha_number')
    .eq('user_id', auth.profile.user_id)
    .single()

  if (patientErr || !patient) {
    return NextResponse.json({ error: 'patient profile not found' }, { status: 404 })
  }

  const { data: consentReq, error: reqErr } = await adminClient
    .from('consent_requests')
    .select('*')
    .eq('request_id', id)
    .eq('abha_number', patient.abha_number)
    .single()

  if (reqErr || !consentReq) {
    return NextResponse.json({ error: 'consent request not found' }, { status: 404 })
  }

  if (consentReq.status !== 'pending') {
    return NextResponse.json({ error: `request already ${consentReq.status}` }, { status: 409 })
  }

  const now = new Date()
  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  // Update consent_request status
  const { error: updateErr } = await adminClient
    .from('consent_requests')
    .update({ status: newStatus, responded_at: now.toISOString() })
    .eq('request_id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  if (action === 'reject') {
    return NextResponse.json({ message: 'consent request rejected' })
  }

  // Approved — create consent record
  const days = duration_days ?? consentReq.requested_duration ?? 30
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  const { data: consent, error: consentErr } = await adminClient
    .from('consents')
    .insert({
      request_id: consentReq.request_id,
      patient_id: patient.patient_id,
      requester_id: consentReq.requester_id,
      requester_type: consentReq.requester_type,
      status: 'approved',
      access_type: consentReq.access_type,
      resource_scope: consentReq.resource_scope,
      granted_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (consentErr) {
    return NextResponse.json({ error: consentErr.message }, { status: 500 })
  }

  // Auto-transfer: stamp resources for this patient with the requester's hospital tag
  // so the requester can read them via the records-by-abha route.
  // Resource scope honors the consent: full access -> all transferable types.
  const requesterRole = consentReq.requester_type as 'hospital' | 'doctor'
  let transferStats: object | null = null
  try {
    const requesterHospitalCode = await resolveRequesterHospitalCode(
      consentReq.requester_id,
      requesterRole,
    )
    if (requesterHospitalCode) {
      const scopeTypes =
        consentReq.access_type === 'resource_level'
          ? (consentReq.resource_scope as string[] | null) ?? []
          : undefined
      transferStats = await transferPatientResourcesToHospital({
        abhaNumber: patient.abha_number,
        requesterHospitalCode,
        scopeTypes,
      })
      console.log('[consent-approve] transfer stats:', transferStats)
    } else {
      console.warn('[consent-approve] requester has no hospital_id, skipping transfer')
    }
  } catch (err) {
    console.error('[consent-approve] transfer error:', err)
    // Non-fatal — consent stays approved. Records route will return empty until retry.
  }

  return NextResponse.json({ ...consent, transfer: transferStats }, { status: 201 })
}
