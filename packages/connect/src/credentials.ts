import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getKey(): Buffer {
  const secret = process.env.PROXYOS_SECRET
  if (!secret) throw new Error('PROXYOS_SECRET env var is required for credential encryption')
  // Pad or truncate to 32 bytes for AES-256
  const buf = Buffer.alloc(32)
  Buffer.from(secret, 'utf8').copy(buf)
  return buf
}

export function encryptCredentials(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Wire format: hex(iv).hex(tag).hex(ciphertext)
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join('.')
}

export function decryptCredentials(encoded: string): string {
  const key = getKey()
  const parts = encoded.split('.')
  if (parts.length !== 3) throw new Error('Invalid encrypted credential format')
  const iv = Buffer.from(parts[0]!, 'hex')
  const tag = Buffer.from(parts[1]!, 'hex')
  const ciphertext = Buffer.from(parts[2]!, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}
