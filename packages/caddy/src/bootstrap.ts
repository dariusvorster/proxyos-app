import { readFile } from 'fs/promises'
import { CaddyClient } from './client'
import { waitForCaddyReady } from './wait-ready'
import { buildCaddyRoute, buildHoldingPageHtml, buildTrustedProxies } from './config'
import { validateCaddyRoute, formatValidation } from './validate'
import type { CaddyRoute } from './types'
import type { Route, SSOProvider } from '@proxyos/types'
import { createLogger } from '@proxyos/logger'

const logger = createLogger('[caddy]')

export interface BootstrapOptions {
  client?: CaddyClient
  serverName?: string
  baseConfigPath?: string
  getRoutes: () => Promise<Route[]>
  getProviders?: () => Promise<Map<string, SSOProvider>>
  buildRoute?: (route: Route, providers: Map<string, SSOProvider>) => CaddyRoute
}

export interface BootstrapResult {
  caddyReachable: boolean
  initialConfigLoaded: boolean
  routesReplaced: number
  pushedRouteIds?: string[]
  error?: string
}

export async function bootstrapCaddy(opts: BootstrapOptions): Promise<BootstrapResult> {
  const client = opts.client ?? new CaddyClient({ serverName: opts.serverName ?? 'main' })
  const serverName = opts.serverName ?? 'main'

  try {
    await waitForCaddyReady({ baseUrl: client['baseUrl'] })
  } catch (e) {
    return {
      caddyReachable: false,
      initialConfigLoaded: false,
      routesReplaced: 0,
      error: e instanceof Error ? e.message : String(e),
    }
  }

  if (!(await client.health())) {
    return {
      caddyReachable: false,
      initialConfigLoaded: false,
      routesReplaced: 0,
      error: 'Caddy admin API not reachable',
    }
  }

  let initialConfigLoaded = false
  if (!(await client.hasServer(serverName))) {
    if (!opts.baseConfigPath) {
      return {
        caddyReachable: true,
        initialConfigLoaded: false,
        routesReplaced: 0,
        error: `Caddy has no server "${serverName}" and no baseConfigPath provided`,
      }
    }
    const raw = await readFile(opts.baseConfigPath, 'utf8')
    await client.loadConfig(JSON.parse(raw))
    initialConfigLoaded = true
  } else if (opts.baseConfigPath) {
    // Server already exists in Caddy's autosave — re-apply the logging config.
    // Caddy does not reliably persist the top-level `logging` section across
    // container restarts, so the access log writer must be re-applied every boot.
    try {
      const raw = await readFile(opts.baseConfigPath, 'utf8')
      const baseConfig = JSON.parse(raw) as Record<string, unknown>
      if (baseConfig.logging) {
        await client.ensureLogging(baseConfig.logging)
      }
    } catch {
      logger.warn('Could not re-apply logging config — access log may be unavailable')
    }
  }

  // Always ensure the TLS app exists — persistent volumes skip loadConfig on restart,
  // so we must initialize the tls app explicitly every time.
  try {
    await client.ensureTlsAppExists()
  } catch {
    // Non-fatal: log and continue. upsertTlsPolicy will surface per-route errors.
  }

  // Set trusted_proxies at the server level so Caddy natively handles X-Forwarded-* headers
  // from Cloudflare, LAN, Tailscale, and Docker networks.
  try {
    await client.setTrustedProxies(serverName, buildTrustedProxies())
  } catch {
    logger.warn('Could not set trusted_proxies — X-Forwarded-* headers may not be preserved correctly from upstream reverse proxies')
  }

  // If a Cloudflare API token is set, inject a catch-all DNS-01 policy so all
  // ACME certs use DNS challenge instead of HTTP-01 (required when port 80 is not
  // publicly accessible). This is a no-op for users without the token.
  const cfToken = process.env.CLOUDFLARE_API_TOKEN
  if (cfToken) {
    try {
      await client.upsertTlsPolicy({
        issuers: [
          {
            module: 'acme',
            challenges: {
              dns: {
                provider: { name: 'cloudflare', api_token: cfToken },
              },
            },
          },
        ],
      })
    } catch {
      // Non-fatal: certs may fall back to HTTP-01.
    }
  }

  const providers = opts.getProviders ? await opts.getProviders() : new Map<string, SSOProvider>()
  const build = opts.buildRoute ?? ((r: Route) => buildCaddyRoute(r))
  const routes = await opts.getRoutes()

  const built = routes
    .filter((r) => r.enabled)
    .map((r) => {
      const route = build(r, providers)
      return { route, source: r, validation: validateCaddyRoute(route) }
    })

  const invalid = built.filter(b => !b.validation.valid)
  if (invalid.length > 0) {
    logger.error({ count: invalid.length }, `${invalid.length} route(s) failed validation — they will NOT be pushed:`)
    for (const b of invalid) {
      logger.error({ validation: formatValidation(b.validation) }, 'route validation failure')
    }
  }

  const caddyRoutes: CaddyRoute[] = built.filter(b => b.validation.valid).map(b => b.route)

  const pushedRouteIds = built.filter(b => b.validation.valid).map(b => b.source.id)
  await client.replaceRoutes(serverName, caddyRoutes)

  try {
    await client.setServerErrors(serverName, {
      routes: [{
        match: [{ expression: '{http.error.status_code} in [502, 503, 504]' }],
        handle: [{
          handler: 'static_response',
          status_code: 503,
          body: buildHoldingPageHtml(),
          headers: { 'Content-Type': ['text/html; charset=utf-8'] },
        }],
      }],
    })
  } catch {
    // Non-fatal: holding page unavailable, Caddy default error pages will show instead.
  }

  return { caddyReachable: true, initialConfigLoaded, routesReplaced: caddyRoutes.length, pushedRouteIds }
}
