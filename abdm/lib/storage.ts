import { adminClient } from '@/lib/supabase/admin'

const BUCKET = process.env.MEDICAL_UPLOADS_BUCKET ?? 'medical-uploads'

export const MEDICAL_UPLOADS_BUCKET = BUCKET

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'document'
}

export function buildStoragePath(
  patientUserId: string,
  uploadId: string,
  filename: string,
): string {
  return `${patientUserId}/${uploadId}/${sanitizeFilename(filename)}`
}

export async function uploadOriginalFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function downloadOriginalFile(
  storagePath: string,
): Promise<{ ok: true; buffer: Buffer; contentType: string } | { ok: false; error: string }> {
  const { data, error } = await adminClient.storage.from(BUCKET).download(storagePath)
  if (error || !data) return { ok: false, error: error?.message ?? 'not found' }
  const arr = await data.arrayBuffer()
  return {
    ok: true,
    buffer: Buffer.from(arr),
    contentType: data.type || 'application/octet-stream',
  }
}

export async function createSignedUrl(
  storagePath: string,
  expiresInSeconds = 300,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { data, error } = await adminClient.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? 'sign failed' }
  }
  return { ok: true, url: data.signedUrl }
}
