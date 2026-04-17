import type { DnsProvider, Route, SSOProvider } from '@proxyos/types'
import type { CaddyHandler, CaddyMatcher, CaddyRoute } from './types'

export interface GeoIPConfig {
  mode: 'allowlist' | 'blocklist'
  countries: string[]
  action: 'block' | 'challenge'
}

export interface BuildOptions {
  ssoProvider?: SSOProvider | null
  dnsProvider?: DnsProvider | null
  geoipConfig?: GeoIPConfig | null
}

export function buildCaddyRoute(route: Route, opts: BuildOptions = {}): CaddyRoute {
  const handlers: CaddyHandler[] = []

  if (opts.geoipConfig && opts.geoipConfig.countries.length > 0) {
    const { mode, countries } = opts.geoipConfig
    const geoMatch = mode === 'blocklist'
      ? [{ geoip: { countries } }]
      : [{ not: [{ geoip: { countries } }] }]
    handlers.push({
      handler: 'subroute',
      routes: [{
        match: geoMatch,
        handle: [{ handler: 'static_response', status_code: 403, body: mode === 'blocklist' ? 'Access denied by geographic restriction.' : 'Access restricted to specific regions.' }],
        terminal: true,
      }],
    })
  }

  if (route.ssoEnabled && opts.ssoProvider) {
    handlers.push({
      handler: 'forward_auth',
      uri: opts.ssoProvider.forwardAuthUrl,
      copy_headers: opts.ssoProvider.authResponseHeaders,
    })
  }

  if (route.basicAuth) {
    handlers.push({
      handler: 'authentication',
      providers: {
        http_basic: {
          accounts: [{ username: route.basicAuth.username, password: route.basicAuth.password }],
        },
      },
    })
  }

  if (route.rateLimit) {
    handlers.push({
      handler: 'rate_limit',
      zone: {
        key: route.rateLimit.key ?? '{remote_host}',
        events: route.rateLimit.requests,
        window: route.rateLimit.window,
      },
    })
  }

  if (route.wafMode && route.wafMode !== 'off') {
    const exclusions = route.wafExclusions ?? []
    handlers.push({
      handler: 'waf',
      enforcement: route.wafMode === 'blocking' ? 'block' : 'detect',
      ...(exclusions.length > 0 ? { rules_exclusions: exclusions.map(id => ({ id })) } : {}),
    })
  }

  if (route.headers) {
    handlers.push({ handler: 'headers', ...route.headers })
  }

  if (route.compressionEnabled) {
    handlers.push({ handler: 'encode', encodings: { gzip: {}, zstd: {} } })
  }

  // §3.15 Mirror / shadow traffic
  if (route.mirrorUpstream) {
    const sampleRate = route.mirrorSampleRate ?? 100
    handlers.push({
      handler: 'copy',
      upstreams: [{ dial: stripScheme(route.mirrorUpstream) }],
      ...(sampleRate < 100 ? { sample_rate: sampleRate / 100 } : {}),
    })
  }

  // §3.14 Blue-green: merge staging upstreams with weight-based split
  const policy = route.lbPolicy ?? 'round_robin'
  const blueGreenUpstreams =
    route.stagingUpstreams && route.stagingUpstreams.length > 0 && route.trafficSplitPct != null
      ? [
          ...route.upstreams.map(u => ({
            dial: stripScheme(u.address),
            weight: Math.round((100 - route.trafficSplitPct!) * (u.weight ?? 1)),
          })),
          ...route.stagingUpstreams.map(u => ({
            dial: stripScheme(u.address),
            weight: Math.round(route.trafficSplitPct! * (u.weight ?? 1)),
          })),
        ]
      : route.upstreams.map(u => ({
          dial: stripScheme(u.address),
          ...(u.weight !== undefined && u.weight !== 1 ? { weight: u.weight } : {}),
        }))

  handlers.push({
    handler: 'reverse_proxy',
    upstreams: blueGreenUpstreams,
    ...(blueGreenUpstreams.length > 1
      ? { load_balancing: { selection_policy: { policy: blueGreenUpstreams.some(u => 'weight' in u) ? 'weighted_round_robin' : policy } } }
      : {}),
    ...(route.healthCheckEnabled
      ? {
          health_checks: {
            active: {
              path: route.healthCheckPath ?? '/',
              interval: `${route.healthCheckInterval ?? 30}s`,
              timeout: '5s',
            },
          },
        }
      : {}),
  })

  const match: CaddyMatcher[] = [{ host: [route.domain] }]
  if (route.ipAllowlist && route.ipAllowlist.length > 0) {
    (match[0] as CaddyMatcher & { remote_ip?: { ranges: string[] } }).remote_ip = { ranges: route.ipAllowlist }
  }

  return {
    '@id': caddyRouteId(route.id),
    match,
    handle: handlers,
    terminal: true,
  }
}

export function caddyRouteId(routeId: string): string {
  return `proxyos-route-${routeId}`
}

export interface TlsPolicy {
  subjects: string[]
  issuers?: Array<Record<string, unknown>>
}

export function buildTlsPolicy(route: Route, dnsProvider?: DnsProvider | null): TlsPolicy | null {
  // Wildcard domains can't use HTTP-01 — upgrade to DNS-01 or internal automatically
  if (route.domain.startsWith('*.') && route.tlsMode === 'auto') {
    if (dnsProvider) {
      return {
        subjects: [route.domain],
        issuers: [{
          module: 'acme',
          challenges: { dns: { provider: { name: dnsProvider.type, ...dnsProvider.credentials } } },
        }],
      }
    }
    return { subjects: [route.domain], issuers: [{ module: 'internal' }] }
  }

  switch (route.tlsMode) {
    case 'off':
      return null
    case 'internal':
      return { subjects: [route.domain], issuers: [{ module: 'internal' }] }
    case 'dns':
      if (!dnsProvider) return { subjects: [route.domain] }
      return {
        subjects: [route.domain],
        issuers: [
          {
            module: 'acme',
            challenges: {
              dns: { provider: { name: dnsProvider.type, ...dnsProvider.credentials } },
            },
          },
        ],
      }
    case 'auto':
    case 'custom':
    default:
      return { subjects: [route.domain] }
  }
}

export function buildAccessListHandlers(accessList: {
  satisfyMode: 'any' | 'all'
  ipRules: Array<{ type: 'allow' | 'deny'; value: string }>
  basicAuth: {
    realm: string
    users: Array<{ username: string; passwordHash: string }>
    protectedPaths?: string[]
  } | null
}): unknown[] {
  const handlers: unknown[] = []

  if (accessList.ipRules.length > 0) {
    const allows = accessList.ipRules.filter((r) => r.type === 'allow').map((r) => r.value)
    const denies = accessList.ipRules.filter((r) => r.type === 'deny').map((r) => r.value)
    if (denies.length > 0) {
      handlers.push({
        handler: 'subroute',
        routes: [{
          match: [{ remote_ip: { ranges: denies } }],
          handle: [{ handler: 'static_response', status_code: 403, body: 'Access denied' }],
          terminal: true,
        }],
      })
    }
    if (allows.length > 0) {
      handlers.push({
        handler: 'subroute',
        routes: [{
          match: [{ not: [{ remote_ip: { ranges: allows } }] }],
          handle: [{ handler: 'static_response', status_code: 403, body: 'Access denied' }],
          terminal: true,
        }],
      })
    }
  }

  if (accessList.basicAuth) {
    handlers.push({
      handler: 'authentication',
      providers: {
        http_basic: {
          realm: accessList.basicAuth.realm,
          accounts: accessList.basicAuth.users.map((u) => ({
            username: u.username,
            password: u.passwordHash,
            salt: '',
          })),
        },
      },
    })
  }

  return handlers
}

export function buildHoldingPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProxyOS — Setting Up</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e2e8f0}
  .card{text-align:center;max-width:420px;padding:48px 40px;background:#1a1d27;border:1px solid #2d3148;border-radius:16px}
  .icon{width:56px;height:56px;margin:0 auto 24px;background:#1e3a5f;border-radius:12px;display:flex;align-items:center;justify-content:center}
  .icon svg{width:28px;height:28px;stroke:#60a5fa;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  h1{font-size:1.25rem;font-weight:600;color:#f1f5f9;margin-bottom:10px}
  p{font-size:.875rem;color:#94a3b8;line-height:1.6;margin-bottom:8px}
  .badge{display:inline-flex;align-items:center;gap:6px;margin-top:24px;padding:6px 14px;background:#0f2a1a;border:1px solid #166534;border-radius:99px;font-size:.75rem;color:#4ade80}
  .dot{width:7px;height:7px;background:#4ade80;border-radius:50%;animation:pulse 1.8s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .footer{margin-top:32px;font-size:.7rem;color:#475569;letter-spacing:.05em;text-transform:uppercase}
</style>
</head>
<body>
<div class="card">
  <div class="icon">
    <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
  </div>
  <h1>This connection is live</h1>
  <p>ProxyOS has routed this domain successfully.</p>
  <p>Your upstream service hasn't responded yet — start it or update the upstream address in ProxyOS to complete the setup.</p>
  <div class="badge"><span class="dot"></span>Proxy active</div>
  <div class="footer">Powered by ProxyOS</div>
</div>
</body>
</html>`
}

function stripScheme(address: string): string {
  const stripped = address.replace(/^https?:\/\//, '')
  return stripped.includes(':') ? stripped : `${stripped}:80`
}

export function buildErrorRoute(host: {
  domain: string
  statusCode: number
  pageType: 'default' | 'custom_html' | 'redirect'
  customHtml?: string | null
  redirectUrl?: string | null
}): CaddyRoute {
  const handlers: CaddyHandler[] = []

  if (host.pageType === 'redirect' && host.redirectUrl) {
    handlers.push({
      handler: 'static_response',
      status_code: 301,
      headers: { Location: [host.redirectUrl] },
    })
  } else {
    handlers.push({
      handler: 'static_response',
      status_code: host.statusCode,
      body: host.pageType === 'custom_html' && host.customHtml
        ? host.customHtml
        : `<!DOCTYPE html><html><head><title>${host.statusCode} Error</title></head><body><h1>${host.statusCode}</h1><p>This service is not available.</p><p style="color:#888;font-size:12px">Powered by ProxyOS</p></body></html>`,
    })
  }

  return {
    '@id': `error_${host.domain}`,
    match: [{ host: [host.domain] }],
    handle: handlers,
    terminal: true,
  }
}

export function buildRedirectRoute(host: {
  sourceDomain: string
  destinationUrl: string
  redirectCode: number
  preservePath: boolean
  preserveQuery: boolean
}): CaddyRoute {
  const location = host.preservePath
    ? host.preserveQuery
      ? `${host.destinationUrl}{http.request.uri}`
      : `${host.destinationUrl}{http.request.uri.path}`
    : host.destinationUrl

  return {
    '@id': `redirect_${host.sourceDomain}`,
    match: [{ host: [host.sourceDomain] }],
    handle: [{
      handler: 'static_response',
      status_code: host.redirectCode,
      headers: { Location: [location] },
    }],
    terminal: true,
  }
}
