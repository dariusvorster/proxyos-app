import { createHmac, randomBytes } from 'crypto'

// ─── Base32 ────────────────────────────────────────────────────────────────

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += BASE32_CHARS[(value >>> bits) & 0x1f]
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 0x1f]
  }
  return output
}

export function base32Decode(input: string): Buffer {
  const str = input.toUpperCase().replace(/=+$/, '')
  let bits = 0
  let value = 0
  const output: number[] = []
  for (const char of str) {
    const idx = BASE32_CHARS.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      output.push((value >>> bits) & 0xff)
    }
  }
  return Buffer.from(output)
}

// ─── HOTP / TOTP ──────────────────────────────────────────────────────────

function hotp(secretBuf: Buffer, counter: number): number {
  const buf = Buffer.alloc(8)
  // Write counter as 64-bit big-endian
  const hi = Math.floor(counter / 0x100000000)
  const lo = counter >>> 0
  buf.writeUInt32BE(hi, 0)
  buf.writeUInt32BE(lo, 4)

  const hmac = createHmac('sha1', secretBuf).update(buf).digest()
  const offset = hmac[hmac.length - 1]! & 0x0f
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
     (hmac[offset + 3]! & 0xff)
  return code % 1_000_000
}

/**
 * Verify a 6-digit TOTP code. Accepts ±1 time step (30s window) to
 * account for clock skew.
 */
export function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false
  const secretBuf = base32Decode(secret)
  const step = Math.floor(Date.now() / 1000 / 30)
  const codeNum = parseInt(code, 10)
  for (const delta of [-1, 0, 1]) {
    if (hotp(secretBuf, step + delta) === codeNum) return true
  }
  return false
}

/**
 * Generate a new TOTP secret (20 random bytes → base32, 160-bit entropy).
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/**
 * Build an otpauth:// URI compatible with Google Authenticator, Authy, etc.
 */
export function buildOtpAuthUri(secret: string, email: string, issuer = 'ProxyOS'): string {
  const label = encodeURIComponent(`${issuer}:${email}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
