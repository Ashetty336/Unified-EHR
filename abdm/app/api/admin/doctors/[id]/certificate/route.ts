import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'
import { downloadOriginalFile } from '@/lib/storage'

type Params = { params: Promise<{ id: string }> }

// GET /api/admin/doctors/[id]/certificate
// Streams the doctor medical license certificate PDF inline for admin review.
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params

  const auth = await requireRole(req, 'admin')
  if (!auth.ok) return auth.response

  const { data: doctor } = await adminClient
    .from('doctors')
    .select('certificate_path, license_number')
    .eq('doctor_id', id)
    .single()

  if (!doctor?.certificate_path) {
    return NextResponse.json({ error: 'no certificate on file' }, { status: 404 })
  }

  const result = await downloadOriginalFile(doctor.certificate_path as string)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  const filename = `${(doctor.license_number as string | null) ?? 'doctor'}-license.pdf`
  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': result.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
