import type { CaddyRoute } from './types'

export type VerifyStatus = 'synced' | 'drift' | 'missing' | 'error' | 'synced-machine'

export interface RouteDiff {
  field: string
  expected: unknown
  actual: unknown
  kind: 'missing' | 'extra' | 'changed'
}

export interface VerifyResult {
  status: VerifyStatus
  diff: RouteDiff[] | null
  expected: CaddyRoute
  actual: CaddyRoute | null
  error?: string
}

// Fields Caddy adds as defaults after push — not real drift
const IGNORED_EXTRA_FIELDS: RegExp[] = [
  /^handle\[\d+\]\.health_checks\.active\.expect_status$/,
  /^handle\[\d+\]\.health_checks\.active\.expect_headers$/,
  /^handle\[\d+\]\.load_balancing\.try_duration$/,
  /^handle\[\d+\]\.load_balancing\.try_interval$/,
]

function isIgnoredExtra(path: string): boolean {
  return IGNORED_EXTRA_FIELDS.some(re => re.test(path))
}

// Collect all leaf dot-paths from a value subtree
function leafPaths(value: unknown, path: string): string[] {
  if (value === null || value === undefined) return [path]
  if (Array.isArray(value)) {
    if (value.length === 0) return [path]
    return value.flatMap((v, i) => leafPaths(v, `${path}[${i}]`))
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === 0) return [path]
    return keys.flatMap(k => leafPaths(obj[k], `${path}.${k}`))
  }
  return [path]
}

// Returns true if every leaf of the extra subtree is on the ignore list
function isEntirelyIgnored(path: string, value: unknown): boolean {
  return leafPaths(value, path).every(p => isIgnoredExtra(p))
}

function isNullish(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

function walkDiff(expected: unknown, actual: unknown, path: string, issues: RouteDiff[]): void {
  // Both nullish — equal
  if (isNullish(expected) && isNullish(actual)) return

  // Type check
  const typeE = Array.isArray(expected) ? 'array' : typeof expected
  const typeA = Array.isArray(actual) ? 'array' : typeof actual

  if (typeE !== typeA) {
    // Nullish on one side
    if (isNullish(expected) && !isNullish(actual)) {
      if (!isIgnoredExtra(path)) {
        issues.push({ field: path, expected, actual, kind: 'extra' })
      }
      return
    }
    if (!isNullish(expected) && isNullish(actual)) {
      issues.push({ field: path, expected, actual, kind: 'missing' })
      return
    }
    issues.push({ field: path, expected, actual, kind: 'changed' })
    return
  }

  if (typeE === 'array') {
    const eArr = expected as unknown[]
    const aArr = actual as unknown[]
    const len = Math.max(eArr.length, aArr.length)
    for (let i = 0; i < len; i++) {
      const childPath = `${path}[${i}]`
      if (i >= eArr.length) {
        if (!isEntirelyIgnored(childPath, aArr[i])) {
          issues.push({ field: childPath, expected: undefined, actual: aArr[i], kind: 'extra' })
        }
      } else if (i >= aArr.length) {
        issues.push({ field: childPath, expected: eArr[i], actual: undefined, kind: 'missing' })
      } else {
        walkDiff(eArr[i], aArr[i], childPath, issues)
      }
    }
    return
  }

  if (typeE === 'object' && expected !== null && actual !== null) {
    const eObj = expected as Record<string, unknown>
    const aObj = actual as Record<string, unknown>
    const allKeys = new Set([...Object.keys(eObj), ...Object.keys(aObj)])
    for (const key of allKeys) {
      const childPath = path ? `${path}.${key}` : key
      if (!(key in eObj)) {
        if (!isNullish(aObj[key]) && !isEntirelyIgnored(childPath, aObj[key])) {
          issues.push({ field: childPath, expected: undefined, actual: aObj[key], kind: 'extra' })
        }
      } else if (!(key in aObj)) {
        if (!isNullish(eObj[key])) {
          issues.push({ field: childPath, expected: eObj[key], actual: undefined, kind: 'missing' })
        }
      } else {
        walkDiff(eObj[key], aObj[key], childPath, issues)
      }
    }
    return
  }

  // Primitives — compare with normalization
  if (expected !== actual) {
    // Port coercion: string vs number (e.g. "8006" === 8006)
    if (String(expected) === String(actual)) return
    issues.push({ field: path, expected, actual, kind: 'changed' })
  }
}

export function diffCaddyRoute(expected: CaddyRoute, actual: CaddyRoute): RouteDiff[] {
  const issues: RouteDiff[] = []
  walkDiff(expected as unknown, actual as unknown, '', issues)
  return issues
}

export function classifyDrift(
  diff: RouteDiff[],
  syncSource: string | null,
): VerifyStatus {
  if (diff.length === 0) return 'synced'

  if (!syncSource || syncSource === 'manual' || syncSource === 'bootstrap' || syncSource === 'drift-repair') {
    return 'drift'
  }

  if (syncSource === 'patchos' || syncSource === 'scheduled') {
    return 'synced-machine'
  }

  return 'drift'
}
