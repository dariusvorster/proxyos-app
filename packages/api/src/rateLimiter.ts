/**
 * In-memory sliding window rate limiter.
 * Resets on process restart — acceptable for single-instance homelab use.
 */

interface Bucket {
  attempts: number
  windowStart: number
  blockedUntil: number
}

const store = new Map<string, Bucket>()

// Tracks in-flight requests per key so concurrent requests at the limit
// boundary cannot all slip through the isBlocked → recordFailure gap.
const pending = new Map<string, number>()

const WINDOW_MS = 15 * 60 * 1000   // 15 minutes
const BLOCK_MS  = 15 * 60 * 1000   // block duration after limit hit
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

// Periodically evict expired entries so the map doesn't grow unbounded
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of store) {
    if (now - bucket.windowStart > WINDOW_MS && bucket.blockedUntil < now) {
      store.delete(key)
    }
  }
}, CLEANUP_INTERVAL_MS).unref()

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the client may retry (only set when blocked) */
  retryAfterSeconds?: number
}

/**
 * Record a failed attempt for the given key and return whether the next
 * attempt should be allowed.
 *
 * @param key      Composite key, e.g. `email:user@example.com` or `ip:1.2.3.4`
 * @param maxAttempts  How many failures are allowed inside the window
 */
export function recordFailure(key: string, maxAttempts: number): RateLimitResult {
  const now = Date.now()
  let bucket = store.get(key)

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { attempts: 0, windowStart: now, blockedUntil: 0 }
  }

  // Already blocked?
  if (bucket.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) }
  }

  bucket.attempts++

  if (bucket.attempts >= maxAttempts) {
    bucket.blockedUntil = now + BLOCK_MS
    store.set(key, bucket)
    return { allowed: false, retryAfterSeconds: Math.ceil(BLOCK_MS / 1000) }
  }

  store.set(key, bucket)
  return { allowed: true }
}

/** Check whether a key is currently blocked without recording an attempt. */
export function isBlocked(key: string): RateLimitResult {
  const now = Date.now()
  const bucket = store.get(key)
  if (!bucket) return { allowed: true }
  if (bucket.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) }
  }
  return { allowed: true }
}

/** Clear rate limit state for a key (call on successful login). */
export function clearLimit(key: string): void {
  store.delete(key)
  pending.delete(key)
}

/**
 * Reserve a slot before async work (e.g. bcrypt). Counts in-flight requests
 * against the limit so concurrent requests cannot all bypass a full bucket.
 * Always pair with `endAttempt` in a finally block.
 */
export function beginAttempt(key: string, maxAttempts: number): RateLimitResult {
  const now = Date.now()
  const bucket = store.get(key)

  if (bucket?.blockedUntil && bucket.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) }
  }

  const recorded = bucket && now - bucket.windowStart <= WINDOW_MS ? bucket.attempts : 0
  const inFlight = pending.get(key) ?? 0

  if (recorded + inFlight >= maxAttempts) {
    return { allowed: false, retryAfterSeconds: Math.ceil(BLOCK_MS / 1000) }
  }

  pending.set(key, inFlight + 1)
  return { allowed: true }
}

/** Release the in-flight slot reserved by `beginAttempt`. */
export function endAttempt(key: string): void {
  const n = pending.get(key) ?? 0
  if (n <= 1) pending.delete(key)
  else pending.set(key, n - 1)
}
