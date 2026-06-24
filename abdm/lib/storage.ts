import { adminClient } from '@/lib/supabase/admin'
import { encryptBuffer, decryptBuffer } from '@/lib/crypto'

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

// Registration/license certificates uploaded at signup, keyed by the
// registrant's user_id. Kept under a dedicated prefix so they never collide
// with patient medical uploads.
export function buildCertificatePath(
  userId: string,
  kind: 'hospital' | 'doctor',
  filename: string,
): string {
  return `certificates/${kind}/${userId}/${sanitizeFilename(filename)}`
}

export async function uploadOriginalFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Encrypt at rest (AES-256-GCM) before the bytes ever touch storage.
  const encrypted = encryptBuffer(buffer)
  const { error } = await adminClient.storage
    .from(BUCKET)
    .upload(storagePath, encrypted, {
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
  // Decrypt at read time. Legacy plaintext (no magic header) passes through.
  let buffer: Buffer
  try {
    buffer = decryptBuffer(Buffer.from(arr))
  } catch {
    return { ok: false, error: 'decryption failed' }
  }
  return {
    ok: true,
    buffer,
    contentType: data.type || 'application/octet-stream',
  }
}

// WARNING: stored objects are AES-256-GCM encrypted. A signed URL serves the
// raw ciphertext from Supabase, bypassing decryptBuffer — the client receives
// an undecryptable blob. Do NOT use for medical files; stream them through a
// route handler that calls downloadOriginalFile instead.
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
