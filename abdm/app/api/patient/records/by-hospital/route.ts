import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'

// GET /api/patient/records/by-hospital
// Returns the patient's uploads grouped by hospital. Each upload row carries
// metadata so the UI can render a "folder" for each one with both the original
// file (downloadable via /api/patient/uploads/[id]/original) and the FHIR
// resources extracted from it (fetchable via /api/patient/uploads/[id]/fhir).
export async function GET(req: Request) {
  const auth = await requireRole(req as never, 'patient')
  if (!auth.ok) return auth.response

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
    .eq('patient_user_id', auth.profile.user_id)
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
        hospital_name: meta?.name ?? (u.hospital_id ? 'Unknown hospital' : 'Self uploads'),
        registration_no: meta?.registration_no ?? null,
        uploads: [],
      })
    }
    groupsMap.get(key)!.uploads!.push(u)
  }

  return NextResponse.json({ groups: Array.from(groupsMap.values()) })
}
