import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { validateConsent } from '@/lib/consent'
import { adminClient } from '@/lib/supabase/admin'
import { downloadOriginalFile } from '@/lib/storage'

type Params = { params: Promise<{ abha: string; uploadId: string }> }

// GET /api/fhir/records/by-abha/[abha]/uploads/[uploadId]/original
// Cross-hospital read of the original uploaded blob, gated by approved consent.
export async function GET(req: NextRequest, { params }: Params) {
  const { abha, uploadId } = await params

  const auth = await requireRole(req, 'doctor', 'hospital', 'admin')
  if (!auth.ok) return auth.response

  const { data: patientRow } = await adminClient
    .from('patients')
    .select('patient_id, user_id')
    .eq('abha_number', abha)
    .single()
  if (!patientRow?.user_id) {
    return NextResponse.json({ error: 'patient not found for ABHA' }, { status: 404 })
  }

  if (auth.profile.role !== 'admin') {
    const consent = await validateConsent(auth.profile.user_id, patientRow.patient_id as string)
    if (!consent.valid) {
      return NextResponse.json({ error: consent.reason }, { status: 403 })
    }
  }

  const { data: upload } = await adminClient
    .from('medical_uploads')
    .select('upload_id, patient_user_id, storage_path, content_type, original_filename')
    .eq('upload_id', uploadId)
    .single()
  if (!upload || upload.patient_user_id !== patientRow.user_id) {
    return NextResponse.json({ error: 'upload not found' }, { status: 404 })
  }

  const result = await downloadOriginalFile(upload.storage_path as string)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  const contentType = (upload.content_type as string | null) ?? result.contentType
  const filename = (upload.original_filename as string | null) ?? 'document'
  const inline =
    contentType.startsWith('application/pdf') ||
    contentType.startsWith('text/') ||
    contentType.includes('json') ||
    contentType.includes('xml')

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
