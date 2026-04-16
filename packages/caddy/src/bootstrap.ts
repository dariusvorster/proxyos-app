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

  const providers = opts.getProviders ? await opts.getProviders() : new Map<string, SSOProvider>()
  const build = opts.buildRoute ?? ((r: Route) => buildCaddyRoute(r))
  const routes = await opts.getRoutes()
  const caddyRoutes: CaddyRoute[] = routes.filter((r) => r.enabled).map((r) => build(r, providers))

  await client.replaceRoutes(serverName, caddyRoutes)

  return { caddyReachable: true, initialConfigLoaded, routesReplaced: caddyRoutes.length }
}
