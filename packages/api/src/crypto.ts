import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'crypto'
import { createLogger } from '@proxyos/logger'

const logger = createLogger('[api]')

const PREFIX_V1 = 'enc:v1:'
const PREFIX_V2 = 'enc:v2:'

function deriveKeyV1(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

function deriveKeyV2(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, '', 'proxyos-aes-key-v2', 32))
}

function getSecret(): string {
  const secret = process.env.PROXYOS_SECRET
  if (!secret) throw new Error('PROXYOS_SECRET environment variable must be set')
  return secret
}

function aesgcmEncrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

function aesgcmDecrypt(key: Buffer, encoded: string): string {
  const payload = Buffer.from(encoded, 'base64url')
  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const ciphertext = payload.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

// New encryptions use v2 (HKDF key derivation)
export function encrypt(plaintext: string): string {
  const key = deriveKeyV2(getSecret())
  return PREFIX_V2 + aesgcmEncrypt(key, plaintext)
}

export function decrypt(value: string): string {
  if (value.startsWith(PREFIX_V2)) {
    return aesgcmDecrypt(deriveKeyV2(getSecret()), value.slice(PREFIX_V2.length))
  }
  if (value.startsWith(PREFIX_V1)) {
    // Legacy v1 — decrypts transparently; value will be re-encrypted as v2 on next write
    return aesgcmDecrypt(deriveKeyV1(getSecret()), value.slice(PREFIX_V1.length))
  }
  // Plaintext fallback for values stored before encryption was added
  logger.warn('decrypting unencrypted value — check migration state')
  return value
}

/** Encrypt a JSON-serialisable object */
export function encryptJson(obj: unknown): string {
  return encrypt(JSON.stringify(obj))
}

/** Decrypt and parse a JSON object, falling back to JSON.parse for legacy plaintext */
export function decryptJson<T = unknown>(value: string): T {
  return JSON.parse(decrypt(value)) as T
}
