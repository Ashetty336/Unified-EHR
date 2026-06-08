import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { validateConsent } from '@/lib/consent'
import { adminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ abha: string }> }

// GET /api/fhir/records/by-abha/[abha]/by-hospital
// Returns the patient's medical_uploads grouped by hospital. Requires an
// approved consent for non-admins. Same shape as /api/patient/records/by-hospital
// so the dashboard renderer can be reused on the requester side.
export async function GET(req: NextRequest, { params }: Params) {
  const { abha } = await params

  const auth = await requireRole(req, 'doctor', 'hospital', 'admin')
  if (!auth.ok) return auth.response

  const { data: patientRow, error: patientErr } = await adminClient
    .from('patients')
    .select('patient_id, user_id')
    .eq('abha_number', abha)
    .single()

  if (patientErr || !patientRow?.user_id) {
    return NextResponse.json({ error: 'patient not found for ABHA' }, { status: 404 })
  }

  if (auth.profile.role !== 'admin') {
    const consent = await validateConsent(auth.profile.user_id, patientRow.patient_id as string)
    if (!consent.valid) {
      return NextResponse.json({ error: consent.reason }, { status: 403 })
    }
  }

  const { data: uploads, error } = await adminClient
    .from('medical_uploads')
    .select(`
      upload_id,
      hospital_id,
      input_type,
      original_filename,
      content_type,
      file_size,
      resource_count,
      uploader_role,
      created_at
    `)
    .eq('patient_user_id', patientRow.user_id as string)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'failed to load uploads' }, { status: 500 })
  }

  const hospitalIds = Array.from(
    new Set((uploads ?? []).map((u) => u.hospital_id).filter(Boolean) as string[]),
  )

  let hospitalMap = new Map<string, { name: string; registration_no: string | null }>()
  if (hospitalIds.length > 0) {
    const { data: hospitals } = await adminClient
      .from('hospitals')
      .select('hospital_id, name, registration_no')
      .in('hospital_id', hospitalIds)
    hospitalMap = new Map(
      (hospitals ?? []).map((h) => [
        h.hospital_id as string,
        { name: h.name as string, registration_no: (h.registration_no as string | null) ?? null },
      ]),
    )
  }

  type Group = {
    hospital_id: string | null
    hospital_name: string
    registration_no: string | null
    uploads: typeof uploads
  }

  const groupsMap = new Map<string, Group>()
  for (const u of uploads ?? []) {
    const key = u.hospital_id ?? 'self'
    if (!groupsMap.has(key)) {
      const meta = u.hospital_id ? hospitalMap.get(u.hospital_id as string) : null
      groupsMap.set(key, {
        hospital_id: (u.hospital_id as string | null) ?? null,
        hospital_name: meta?.name ?? (u.hospital_id ? 'Unknown hospital' : 'Patient self upload'),
        registration_no: meta?.registration_no ?? null,
        uploads: [],
      })
    }
    groupsMap.get(key)!.uploads!.push(u)
  }

  return NextResponse.json({ groups: Array.from(groupsMap.values()) })
}
