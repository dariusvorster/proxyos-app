export interface Fail2banFilter {
  statusCode?: number[]
  pathPattern?: string
  userAgentPattern?: string
}

export interface Fail2banRule {
  name: string
  filter: Fail2banFilter
  threshold: number
  windowSeconds: number
  banDurationSeconds: number
  routes: string[] | 'all'
}

export interface BanEntry {
  ip: string
  reason: string
  ruleName?: string
  bannedAt: Date
  expiresAt?: Date
  routeId?: string
  permanent: boolean
}

// Presets
export const FAIL2BAN_PRESETS: Fail2banRule[] = [
  {
    name: 'WordPress scanner',
    filter: { pathPattern: '^/(wp-login\\.php|xmlrpc\\.php|wp-admin/)' },
    threshold: 3,
    windowSeconds: 60,
    banDurationSeconds: 86400,
    routes: 'all',
  },
  {
    name: 'Auth bruteforce',
    filter: { statusCode: [401, 403] },
    threshold: 5,
    windowSeconds: 60,
    banDurationSeconds: 3600,
    routes: 'all',
  },
  {
    name: 'Generic scanner',
    filter: { pathPattern: '^/(\\.env|\\.git/|admin\\.php|config\\.php|setup\\.php)' },
    threshold: 2,
    windowSeconds: 300,
    banDurationSeconds: 172800,
    routes: 'all',
  },
]

interface HitRecord {
  timestamps: number[]
}

const hitMap = new Map<string, HitRecord>()

/**
 * Evaluate an incoming request against a fail2ban rule.
 * Returns true if the IP should be banned.
 */
export function evaluateRequest(
  ip: string,
  statusCode: number,
  path: string,
  userAgent: string,
  rule: Fail2banRule,
): boolean {
  const { filter, threshold, windowSeconds } = rule
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  // Check if this request matches the filter
  let matches = false
  if (filter.statusCode && filter.statusCode.includes(statusCode)) matches = true
  if (filter.pathPattern && new RegExp(filter.pathPattern).test(path)) matches = true
  if (filter.userAgentPattern && new RegExp(filter.userAgentPattern).test(userAgent)) matches = true
  if (!matches) return false

  const key = `${ip}:${rule.name}`
  const record = hitMap.get(key) ?? { timestamps: [] }

  // Prune old hits outside window
  record.timestamps = record.timestamps.filter(t => now - t < windowMs)
  record.timestamps.push(now)
  hitMap.set(key, record)

  return record.timestamps.length >= threshold
}

/** Clear hit history for an IP (e.g. after ban). */
export function clearHits(ip: string): void {
  for (const key of hitMap.keys()) {
    if (key.startsWith(`${ip}:`)) hitMap.delete(key)
  }
}

export function parseRule(json: string): Fail2banRule {
  return JSON.parse(json) as Fail2banRule
}
