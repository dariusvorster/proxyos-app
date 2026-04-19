import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const PREFIX = 'enc:v1:'

function deriveKey(): Buffer {
  const secret = process.env.PROXYOS_SECRET
  if (!secret) throw new Error('PROXYOS_SECRET environment variable must be set')
  return createHash('sha256').update(secret).digest()
}

export function encrypt(plaintext: string): string {
  const key = deriveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, tag, encrypted])
  return PREFIX + payload.toString('base64url')
}

export function decrypt(value: string): string {
  // Gracefully handle plaintext values stored before encryption was added
  if (!value.startsWith(PREFIX)) return value
  const key = deriveKey()
  const payload = Buffer.from(value.slice(PREFIX.length), 'base64url')
  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const ciphertext = payload.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

/** Encrypt a JSON-serialisable object */
export function encryptJson(obj: unknown): string {
  return encrypt(JSON.stringify(obj))
}

/** Decrypt and parse a JSON object, falling back to JSON.parse for legacy plaintext */
export function decryptJson<T = unknown>(value: string): T {
  return JSON.parse(decrypt(value)) as T
}
