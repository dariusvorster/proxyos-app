import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

function getKey(): Buffer {
  // String concatenation prevents webpack DefinePlugin from inlining this at build time.
  // The value is resolved from the actual process.env at runtime.
  const envKey = 'PROXYOS' + '_SECRET'
  const secret = process.env[envKey]
  if (!secret) {
    throw new Error(
      '[connect] PROXYOS_SECRET environment variable is not set. ' +
      'Set it to a strong random string to enable credential encryption.',
    )
  }
  return scryptSync(secret, 'proxyos-salt', 32) as Buffer
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
