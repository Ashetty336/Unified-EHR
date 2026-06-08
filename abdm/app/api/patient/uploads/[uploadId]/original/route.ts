import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'
import { downloadOriginalFile } from '@/lib/storage'

type Params = { params: Promise<{ uploadId: string }> }

// GET /api/patient/uploads/[uploadId]/original
// Streams the original uploaded file back to the patient.
export async function GET(req: NextRequest, { params }: Params) {
  const { uploadId } = await params

  const auth = await requireRole(req, 'patient')
  if (!auth.ok) return auth.response

  const { data: upload, error } = await adminClient
    .from('medical_uploads')
    .select('upload_id, patient_user_id, storage_path, content_type, original_filename')
    .eq('upload_id', uploadId)
    .single()

  if (error || !upload || upload.patient_user_id !== auth.profile.user_id) {
    return NextResponse.json({ error: 'upload not found' }, { status: 404 })
  }

  const result = await downloadOriginalFile(upload.storage_path as string)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  const contentType = (upload.content_type as string | null) ?? result.contentType
  const filename = (upload.original_filename as string | null) ?? 'document'
  const inline = contentType.startsWith('application/pdf') || contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml')

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
