import { createHmac, timingSafeEqual } from 'crypto'
import type { LemonSqueezyEvent } from './types'

/**
 * Verifies a Lemon Squeezy webhook signature.
 * LS sends X-Signature: hex(HMAC-SHA256(secret, rawBody))
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) return false
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}

/**
 * Parses and validates the shape of a Lemon Squeezy webhook payload.
 * Returns null if the payload is malformed.
 */
export function parseWebhookPayload(rawBody: string): LemonSqueezyEvent | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('meta' in parsed) ||
      !('data' in parsed)
    ) {
      return null
    }
    return parsed as LemonSqueezyEvent
  } catch {
    return null
  }
}
