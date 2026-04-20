import type { CaddyRoute } from './types'

export interface ValidationIssue {
  severity: 'error' | 'warning'
  field: string
  message: string
  routeId: string
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

const HTTPS_PORTS = new Set([443, 8006, 8007, 8443, 9090, 9443, 10443])
const DIAL_RE = /^[^\s]+:\d+$/

function portFromDial(dial: string): number | null {
  const m = dial.match(/:(\d+)$/)
  return m ? Number(m[1]) : null
}

export function validateCaddyRoute(caddyRoute: CaddyRoute): ValidationResult {
  const issues: ValidationIssue[] = []
  const routeId = caddyRoute['@id'] ?? '(unknown)'

  // E6: @id
  if (!caddyRoute['@id'] || !/^proxyos-route-.+$/.test(caddyRoute['@id'])) {
    issues.push({ severity: 'error', field: '@id', message: '@id must match proxyos-route-*', routeId })
  }

  // E7: match[0].host
  const match0 = caddyRoute.match?.[0]
  if (!caddyRoute.match || caddyRoute.match.length === 0 || !match0?.host || match0.host.length === 0) {
    issues.push({ severity: 'error', field: 'match[0].host', message: 'match[0].host must be a non-empty array of strings', routeId })
  }

  // E8: terminal
  if (caddyRoute.terminal !== true) {
    issues.push({ severity: 'error', field: 'terminal', message: 'terminal must be true', routeId })
  }

  // E1: reverse_proxy handler must exist
  const rpEntries = caddyRoute.handle
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.handler === 'reverse_proxy')

  if (rpEntries.length === 0) {
    issues.push({ severity: 'error', field: 'handle', message: 'handle must contain at least one reverse_proxy handler', routeId })
    return { valid: issues.filter(i => i.severity === 'error').length === 0, issues }
  }

  for (const { h: rp, i: idx } of rpEntries) {
    const base = `handle[${idx}]`
    const upstreams = rp['upstreams'] as Array<Record<string, unknown>> | undefined

    // E2: upstreams non-empty, each dial matches host:port
    if (!Array.isArray(upstreams) || upstreams.length === 0) {
      issues.push({ severity: 'error', field: `${base}.upstreams`, message: 'upstreams must be a non-empty array', routeId })
    } else {
      for (let j = 0; j < upstreams.length; j++) {
        const dial = upstreams[j]?.['dial']
        if (typeof dial !== 'string' || !dial || !DIAL_RE.test(dial)) {
          issues.push({ severity: 'error', field: `${base}.upstreams[${j}].dial`, message: `dial must be host:port, got: ${String(dial)}`, routeId })
        }
      }
    }

    const headers = rp['headers'] as { request?: { set?: Record<string, unknown> } } | undefined
    const reqSet = headers?.request?.set ?? {}

    // E3: Host header must be ['{http.request.host}']
    const hostVal = reqSet['Host']
    if (!Array.isArray(hostVal) || !hostVal.includes('{http.request.host}')) {
      issues.push({ severity: 'error', field: `${base}.headers.request.set.Host`, message: "Host header missing — should be ['{http.request.host}']", routeId })
    }

    // E4: X-Real-IP must be set; X-Forwarded-* managed natively by server-level trusted_proxies
    if (!reqSet['X-Real-IP']) {
      issues.push({ severity: 'error', field: `${base}.headers.request.set.X-Real-IP`, message: 'X-Real-IP missing', routeId })
    }

    // E5: HTTPS-port upstreams require transport block
    if (Array.isArray(upstreams) && upstreams.length > 0) {
      const hasHttpsPort = upstreams.some(u => {
        const d = u?.['dial']
        if (typeof d !== 'string') return false
        const port = portFromDial(d)
        return port !== null && HTTPS_PORTS.has(port)
      })
      if (hasHttpsPort) {
        const transport = rp['transport'] as { protocol?: string; tls?: unknown } | undefined
        if (!transport || transport.protocol !== 'http' || !transport.tls) {
          issues.push({ severity: 'error', field: `${base}.transport`, message: 'Upstream on HTTPS port requires transport.tls block', routeId })
        }
      }
    }

    // W2: empty health check path
    const hc = rp['health_checks'] as { active?: { path?: string } } | undefined
    if (hc?.active?.path === '') {
      issues.push({ severity: 'warning', field: `${base}.health_checks.active.path`, message: 'health_checks.active.path is empty string — likely a form bug', routeId })
    }
  }

  return { valid: issues.filter(i => i.severity === 'error').length === 0, issues }
}

export function formatValidation(result: ValidationResult): string {
  const routeId = result.issues[0]?.routeId ?? '(unknown)'
  const errors = result.issues.filter(i => i.severity === 'error').length
  const warnings = result.issues.filter(i => i.severity === 'warning').length
  const lines: string[] = [
    `[caddy-validate] route ${routeId} — ${errors} error${errors !== 1 ? 's' : ''}, ${warnings} warning${warnings !== 1 ? 's' : ''}`,
  ]
  for (const issue of result.issues) {
    const tag = issue.severity === 'error' ? 'ERROR' : 'WARN '
    lines.push(`  ${tag} [${issue.field}] ${issue.message}`)
  }
  return lines.join('\n')
}
