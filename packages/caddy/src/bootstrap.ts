import { readFile } from 'fs/promises'
import { CaddyClient } from './client'
import { buildCaddyRoute } from './config'
import type { CaddyRoute } from './types'
import type { Route, SSOProvider } from '@proxyos/types'

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
  error?: string
}

export async function bootstrapCaddy(opts: BootstrapOptions): Promise<BootstrapResult> {
  const client = opts.client ?? new CaddyClient({ serverName: opts.serverName ?? 'main' })
  const serverName = opts.serverName ?? 'main'

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
  }

  // Always ensure the TLS app exists — persistent volumes skip loadConfig on restart,
  // so we must initialize the tls app explicitly every time.
  try {
    await client.ensureTlsAppExists()
  } catch {
    // Non-fatal: log and continue. upsertTlsPolicy will surface per-route errors.
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
  const caddyRoutes: CaddyRoute[] = routes.filter((r) => r.enabled).map((r) => build(r, providers))

  await client.replaceRoutes(serverName, caddyRoutes)

  return { caddyReachable: true, initialConfigLoaded, routesReplaced: caddyRoutes.length }
}
