import type WebSocket from 'ws'
import type { MsgConfigFull, MsgConfigDiff, FedRoute } from '@proxyos/federation'
import { getDb } from '@proxyos/db'
import { agentRegistry } from './agent-registry'

function routeToFed(row: ReturnType<typeof getDb> extends { select: () => unknown } ? never : never): FedRoute {
  // typed via schema row
  return row as unknown as FedRoute
}

export async function pushFullConfig(agentId: string): Promise<void> {
  const state = agentRegistry.get(agentId)
  if (!state) return

  const db = getDb()
  const routeRows = await db.query.routes.findMany({
    where: (r, { or, isNull, eq }) => or(isNull(r.agentId), eq(r.agentId, agentId)),
  })
  const ssoRows = await db.query.ssoProviders.findMany({ where: (s, { eq }) => eq(s.enabled, true) })

  const routes: FedRoute[] = routeRows.map(r => ({
    id: r.id,
    name: r.name,
    domain: r.domain,
    enabled: r.enabled,
    upstreamType: r.upstreamType,
    upstreams: r.upstreams,
    tlsMode: r.tlsMode as FedRoute['tlsMode'],
    ssoEnabled: r.ssoEnabled,
    ssoProviderId: r.ssoProviderId,
    tlsDnsProviderId: r.tlsDnsProviderId,
    rateLimit: r.rateLimit,
    ipAllowlist: r.ipAllowlist,
    basicAuth: r.basicAuth,
    headers: r.headers,
    healthCheckEnabled: r.healthCheckEnabled,
    healthCheckPath: r.healthCheckPath,
    healthCheckInterval: r.healthCheckInterval,
    compressionEnabled: r.compressionEnabled,
    websocketEnabled: r.websocketEnabled,
  }))

  const msg: MsgConfigFull = {
    type: 'config.full',
    routes,
    ssoProviders: ssoRows.map(s => ({
      id: s.id,
      type: s.type,
      forwardAuthUrl: s.forwardAuthUrl,
      authResponseHeaders: JSON.parse(s.authResponseHeaders) as string[],
      trustedIps: JSON.parse(s.trustedIPs) as string[],
    })),
    tlsConfig: {},
    timestamp: Date.now(),
  }

  send(state.ws, msg)
}

export async function pushDiff(
  agentId: string,
  added: FedRoute[],
  updated: FedRoute[],
  removed: string[],
): Promise<void> {
  const state = agentRegistry.get(agentId)
  if (!state) return

  const msg: MsgConfigDiff = {
    type: 'config.diff',
    added,
    updated,
    removed,
    timestamp: Date.now(),
  }
  send(state.ws, msg)
}

export function pushDiffToAll(added: FedRoute[], updated: FedRoute[], removed: string[]): void {
  for (const agent of agentRegistry.getAll()) {
    const msg: MsgConfigDiff = { type: 'config.diff', added, updated, removed, timestamp: Date.now() }
    send(agent.ws, msg)
  }
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(msg))
  }
}
