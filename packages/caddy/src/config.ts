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
        key: '{remote_host}',
        events: route.rateLimit.requests,
        window: route.rateLimit.window,
      },
    })
  }

  if (route.headers) {
    handlers.push({ handler: 'headers', ...route.headers })
  }

  if (route.compressionEnabled) {
    handlers.push({ handler: 'encode', encodings: { gzip: {}, zstd: {} } })
  }

  const policy = route.lbPolicy ?? 'round_robin'
  handlers.push({
    handler: 'reverse_proxy',
    upstreams: route.upstreams.map((u) => ({
      dial: stripScheme(u.address),
      ...(u.weight !== undefined && u.weight !== 1 ? { weight: u.weight } : {}),
    })),
    ...(route.upstreams.length > 1
      ? { load_balancing: { selection_policy: { policy } } }
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
      handlers.push({ handler: 'remote_ip', deny: denies })
    }
    if (allows.length > 0) {
      handlers.push({ handler: 'remote_ip', ranges: allows })
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
