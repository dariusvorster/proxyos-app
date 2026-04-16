const MAIL_DOMAIN_PATTERNS = [/^mail\./i, /^smtp\./i, /^imap\./i, /^webmail\./i, /^mta\./i]
const MAIL_PORTS = new Set([25, 587, 993, 995, 4190])

export interface MailRouteFlag {
  routeId: string
  domain: string
  reason: string
}

export function detectMailRoutes(routes: Array<{ id: string; domain: string; upstreams: string }>): MailRouteFlag[] {
  const flags: MailRouteFlag[] = []

  for (const r of routes) {
    const isDomainMatch = MAIL_DOMAIN_PATTERNS.some(p => p.test(r.domain))
    let isPortMatch = false

    try {
      const upstreams = JSON.parse(r.upstreams) as Array<{ url?: string } | string>
      for (const u of upstreams) {
        const url = typeof u === 'string' ? u : u.url ?? ''
        const portMatch = url.match(/:(\d+)$/)
        if (portMatch && MAIL_PORTS.has(parseInt(portMatch[1]!, 10))) {
          isPortMatch = true
          break
        }
      }
    } catch { /* ignore */ }

    if (isDomainMatch || isPortMatch) {
      flags.push({
        routeId: r.id,
        domain: r.domain,
        reason: isDomainMatch ? `Domain matches mail pattern` : `Upstream uses mail port`,
      })
    }
  }

  return flags
}

export function buildMxWatchNodeLabel(score: number | null): string {
  if (score === null) return 'MxWatch — not connected'
  if (score >= 9) return `MxWatch — deliverability: ${score}/10`
  if (score >= 7) return `MxWatch — deliverability: ${score}/10 (needs attention)`
  return `MxWatch — deliverability: ${score}/10 (critical)`
}
