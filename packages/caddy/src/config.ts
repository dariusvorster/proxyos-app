import type { DnsProvider, Route, RouteRule, SSOProvider } from '@proxyos/types'
import type { CaddyHandler, CaddyMatcher, CaddyRoute } from './types'

export interface GeoIPConfig {
  mode: 'allowlist' | 'blocklist'
  countries: string[]
  action: 'block' | 'challenge'
}

export interface MTLSConfig {
  caCert: string
  requireClientCert: boolean
}

export interface BotChallengeConfig {
  provider: 'turnstile' | 'hcaptcha'
  siteKey: string
  secretKey: string
  skipPaths?: string[]
}

export interface TraceConfig {
  enabled: boolean
  headerName: string
  generateIfMissing: boolean
}

export interface BuildOptions {
  ssoProvider?: SSOProvider | null
  dnsProvider?: DnsProvider | null
  geoipConfig?: GeoIPConfig | null
  mtlsConfig?: MTLSConfig | null
  botChallengeConfig?: BotChallengeConfig | null
  routeRules?: RouteRule[]
  traceConfig?: TraceConfig | null
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

  if (opts.botChallengeConfig) {
    const { skipPaths } = opts.botChallengeConfig
    const verifyUri = (process.env.PROXYOS_INTERNAL_URL ?? 'http://localhost:3000') + '/api/bot-challenge/verify'
    const forwardAuthHandler: CaddyHandler = {
      handler: 'forward_auth',
      uri: verifyUri,
      copy_headers: ['X-Bot-Verified'],
    }
    if (skipPaths && skipPaths.length > 0) {
      handlers.push({
        handler: 'subroute',
        routes: [{
          match: [{ not: [{ path: skipPaths }] }],
          handle: [forwardAuthHandler],
        }],
      })
    } else {
      handlers.push(forwardAuthHandler)
    }
  }

  // §10.3 Request tracing — inject X-Request-ID (or configured header) using Caddy's per-request UUID
  if (opts.traceConfig?.enabled) {
    const headerName = opts.traceConfig.headerName || 'X-Request-ID'
    const setObj: Record<string, string[]> = {}
    setObj[headerName] = ['{http.request.uuid}']
    handlers.push({
      handler: 'headers',
      request: { set: setObj },
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

  if (route.hstsEnabled && route.tlsMode !== 'off') {
    const hstsValue = `max-age=63072000${route.hstsSubdomains ? '; includeSubDomains' : ''}`
    handlers.push({
      handler: 'headers',
      response: { set: { 'Strict-Transport-Security': [hstsValue] } },
    })
  }

  if (route.headers) {
    handlers.push({ handler: 'headers', ...route.headers })
  }

  if (route.compressionEnabled) {
    handlers.push({ handler: 'encode', encodings: { gzip: {}, zstd: {} } })
  }

  // §9.5 Smart routing rules — evaluated as ordered subroutes before the main proxy
  const enabledRules = (opts.routeRules ?? []).filter(r => r.enabled).sort((a, b) => a.priority - b.priority)
  if (enabledRules.length > 0) {
    const ruleRoutes = enabledRules.map(rule => {
      let match: Record<string, unknown>
      switch (rule.matcherType) {
        case 'path':   match = { path: [rule.matcherValue] }; break
        case 'header': match = { header: { [rule.matcherKey ?? '']: [rule.matcherValue] } }; break
        case 'query':  match = { query: { [rule.matcherKey ?? '']: [rule.matcherValue] } }; break
        case 'method': match = { method: [rule.matcherValue.toUpperCase()] }; break
        default:       match = { path: [rule.matcherValue] }
      }
      let handle: CaddyHandler[]
      if (rule.action === 'redirect' && rule.redirectUrl) {
        handle = [{ handler: 'static_response', status_code: 302, headers: { Location: [rule.redirectUrl] } }]
      } else if (rule.action === 'static') {
        handle = [{ handler: 'static_response', status_code: rule.staticStatus ?? 200, body: rule.staticBody ?? '' }]
      } else if (rule.action === 'upstream' && rule.upstream) {
        const dial = rule.upstream.replace(/^https?:\/\//, '')
        handle = [{ handler: 'reverse_proxy', upstreams: [{ dial }] }]
      } else {
        return null
      }
      return { match: [match], handle, terminal: true }
    }).filter(Boolean)
    if (ruleRoutes.length > 0) {
      handlers.push({ handler: 'subroute', routes: ruleRoutes })
    }
  }

  // §9.6 Path rewrite
  if (route.pathRewrite) {
    const pr = route.pathRewrite
    if (pr.regex) {
      handlers.push({ handler: 'rewrite', uri_regexp: [{ find: pr.regex.from, replace: pr.regex.to }] })
    } else {
      const rewriteHandler: CaddyHandler = { handler: 'rewrite' }
      if (pr.strip) rewriteHandler.strip_path_prefix = pr.strip
      if (pr.add) rewriteHandler.uri = pr.add + '{http.request.uri}'
      handlers.push(rewriteHandler)
    }
  }

  // §9.6 CORS response headers
  if (route.corsConfig) {
    const cc = route.corsConfig
    const origins = cc.preset === 'permissive' ? ['*'] : (cc.allowOrigins ?? [])
    const methods = cc.allowMethods ?? (cc.preset === 'permissive' ? ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] : ['GET', 'POST', 'OPTIONS'])
    const allowHeaders = cc.allowHeaders ?? ['Content-Type', 'Authorization']
    const set: Record<string, string[]> = {
      'Access-Control-Allow-Origin': origins,
      'Access-Control-Allow-Methods': [methods.join(', ')],
      'Access-Control-Allow-Headers': [allowHeaders.join(', ')],
    }
    if (cc.exposeHeaders && cc.exposeHeaders.length > 0) {
      set['Access-Control-Expose-Headers'] = [cc.exposeHeaders.join(', ')]
    }
    if (cc.maxAge) set['Access-Control-Max-Age'] = [String(cc.maxAge)]
    handlers.push({ handler: 'headers', response: { set } })
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

  const allUpstreamsFlat = [...route.upstreams, ...(route.stagingUpstreams ?? [])]

  // Detect HTTPS upstream by scheme prefix OR well-known HTTPS ports.
  // Proxmox/PBS use 8006/8007 with self-signed certs — auto-detect prevents 301 loops.
  const HTTPS_PORTS = new Set([443, 8006, 8007, 8443, 9090, 9443, 10443])
  const isHttpsByPort = (addr: string): boolean => {
    const m = addr.match(/:(\d+)(?:\/|$)/)
    return m ? HTTPS_PORTS.has(Number(m[1])) : false
  }
  const httpsByScheme = allUpstreamsFlat.some(u => u.address.startsWith('https://'))
  const httpsByPort = allUpstreamsFlat.some(u => isHttpsByPort(u.address))
  const httpsUpstream = httpsByScheme || httpsByPort
  // Port-detected HTTPS implies skip-verify (self-signed is the norm for those services)
  const upstreamSkipVerify =
    allUpstreamsFlat.some(u => u.skipVerify) || httpsByPort || Boolean(route.skipTlsVerify)

  // The reverse_proxy handler — every field here is unconditional except the optional blocks.
  // Host/X-Forwarded-* headers are ALWAYS set so upstream sees real client context.
  // WebSocket Upgrade/Connection headers are passed through via standard Caddy reverse_proxy
  //   behavior (it handles Upgrade transparently as long as we don't strip the headers).
  const reverseProxyHandler: CaddyHandler = {
    handler: 'reverse_proxy',
    upstreams: blueGreenUpstreams,
    headers: {
      request: {
        set: {
          'Host': ['{http.request.host}'],
          'X-Forwarded-Host': ['{http.request.header.X-Forwarded-Host:{http.request.host}}'],
          'X-Forwarded-Proto': ['{http.request.header.X-Forwarded-Proto:{http.request.scheme}}'],
          'X-Forwarded-Port': ['{http.request.header.X-Forwarded-Port:{http.request.port}}'],
          'X-Real-IP': ['{http.request.remote.host}'],
        },
        add: {
          'X-Forwarded-For': ['{http.request.remote.host}'],
        },
      },
    },
    // Always emit transport block for HTTPS upstreams so Caddy dials HTTPS, not HTTP.
    // Without this block, Caddy defaults to HTTP and HTTPS-only upstreams redirect-loop.
    ...(httpsUpstream
      ? {
          transport: {
            protocol: 'http',
            tls: {
              insecure_skip_verify: upstreamSkipVerify,
            },
          },
        }
      : {}),
    ...(blueGreenUpstreams.length > 1
      ? {
          load_balancing: {
            selection_policy: {
              policy: blueGreenUpstreams.some(u => 'weight' in u) ? 'weighted_round_robin' : policy,
            },
          },
        }
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
  }

  handlers.push(reverseProxyHandler)

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

export function buildTlsConnectionPolicy(domain: string, mtlsConfig: MTLSConfig): Record<string, unknown> {
  return {
    match: { sni: [domain] },
    client_authentication: {
      ca: {
        provider: 'inline',
        trusted_certs_pem: [mtlsConfig.caCert],
      },
      mode: mtlsConfig.requireClientCert ? 'require_and_verify' : 'verify_if_given',
    },
  }
}

function stripScheme(address: string): string {
  const isHttps = address.startsWith('https://')
  const stripped = address.replace(/^https?:\/\//, '')
  return stripped.includes(':') ? stripped : `${stripped}:${isHttps ? '443' : '80'}`
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
