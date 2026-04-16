import type { DnsProvider, Route, SSOProvider } from '@proxyos/types'
import type { CaddyHandler, CaddyMatcher, CaddyRoute } from './types'

export interface BuildOptions {
  ssoProvider?: SSOProvider | null
  dnsProvider?: DnsProvider | null
}

export function buildCaddyRoute(route: Route, opts: BuildOptions = {}): CaddyRoute {
  const handlers: CaddyHandler[] = []

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

  handlers.push({
    handler: 'reverse_proxy',
    upstreams: route.upstreams.map((u) => ({ dial: stripScheme(u.address) })),
    ...(route.upstreams.length > 1
      ? { load_balancing: { selection_policy: { policy: 'least_conn' } } }
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

function stripScheme(address: string): string {
  const stripped = address.replace(/^https?:\/\//, '')
  return stripped.includes(':') ? stripped : `${stripped}:80`
}
