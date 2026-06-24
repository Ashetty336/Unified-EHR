import crypto from 'crypto'

// At-rest encryption for medical files (reports, prescriptions, certificates).
// AES-256-GCM: confidentiality + integrity (auth tag detects tampering).
//
// On-disk blob layout:
//   [4B magic "ENC1"][12B IV][16B auth tag][ciphertext...]
//
// Files written before encryption was enabled have no magic header and are
// returned as-is on read (backward compatible). New writes are always encrypted.

const MAGIC = Buffer.from('ENC1', 'ascii') // 4 bytes
const IV_LEN = 12
const TAG_LEN = 16
const ALGO = 'aes-256-gcm'

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.MEDICAL_FILES_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'MEDICAL_FILES_ENCRYPTION_KEY is not set. Generate one with: ' +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    )
  }
  // Accept base64 or hex; must decode to exactly 32 bytes (AES-256).
  let key: Buffer
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex')
  } else {
    key = Buffer.from(raw, 'base64')
  }
  if (key.length !== 32) {
    throw new Error(
      `MEDICAL_FILES_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). ` +
        'Use a base64- or hex-encoded 256-bit key.',
    )
  }
  cachedKey = key
  return key
}

// Encrypt a plaintext buffer. Output carries its own IV + auth tag.
export function encryptBuffer(plaintext: Buffer): Buffer {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([MAGIC, iv, tag, ciphertext])
}

// True if the blob was produced by encryptBuffer (has the magic header).
export function isEncrypted(blob: Buffer): boolean {
  return blob.length >= MAGIC.length && blob.subarray(0, MAGIC.length).equals(MAGIC)
}

// Decrypt a blob from storage. Legacy (pre-encryption) plaintext is detected
// by the absent magic header and returned unchanged.
export function decryptBuffer(blob: Buffer): Buffer {
  if (!isEncrypted(blob)) return blob
  const key = getKey()
  let offset = MAGIC.length
  const iv = blob.subarray(offset, offset + IV_LEN)
  offset += IV_LEN
  const tag = blob.subarray(offset, offset + TAG_LEN)
  offset += TAG_LEN
  const ciphertext = blob.subarray(offset)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}
