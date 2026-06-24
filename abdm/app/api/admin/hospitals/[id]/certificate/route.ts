import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'
import { downloadOriginalFile } from '@/lib/storage'

type Params = { params: Promise<{ id: string }> }

// GET /api/admin/hospitals/[id]/certificate
// Streams the hospital registration certificate PDF inline for admin review.
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params

  const auth = await requireRole(req, 'admin')
  if (!auth.ok) return auth.response

  const { data: hospital } = await adminClient
    .from('hospitals')
    .select('certificate_path, name')
    .eq('hospital_id', id)
    .single()

  if (!hospital?.certificate_path) {
    return NextResponse.json({ error: 'no certificate on file' }, { status: 404 })
  }

  const result = await downloadOriginalFile(hospital.certificate_path as string)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  const filename = `${(hospital.name as string | null) ?? 'hospital'}-certificate.pdf`
  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': result.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
