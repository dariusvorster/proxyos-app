import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { createHash } from 'crypto'
import { getDb, agents, revokedAgentTokens } from '@proxyos/db'
import { eq } from 'drizzle-orm'
import type { FederationMsg, AgentToCentralMsg } from '@proxyos/federation'
import { FEDERATION_WS_PORT, PING_INTERVAL_MS } from '@proxyos/federation'
import { agentRegistry } from './agent-registry'
import { pushFullConfig } from './config-push'
import { handleMetricsPush } from './metrics-collector'
import { logBroker } from './log-broker'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

async function authenticate(token: string): Promise<string | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString())
    const agentId: string = payload.sub
    const exp: number = payload.exp

    if (Date.now() > exp) return null

    const db = getDb()
    const agent = await db.select().from(agents).where(eq(agents.id, agentId)).get()
    if (!agent) return null

    // Check revocation
    const th = hashToken(token)
    const revoked = await db.select().from(revokedAgentTokens).where(eq(revokedAgentTokens.tokenHash, th)).get()
    if (revoked) return null

    return agentId
  } catch {
    return null
  }
}

export function startFederationServer(): void {
  const server = createServer()
  const wss = new WebSocketServer({ server, path: '/api/agents/connect' })

  wss.on('connection', (ws, req) => {
    const token = new URL(req.url ?? '', 'http://localhost').searchParams.get('token') ?? ''

    authenticate(token).then(agentId => {
      if (!agentId) {
        ws.close(4001, 'Unauthorized')
        return
      }

      agentRegistry.register(agentId, ws)

      // Update DB status
      void getDb().update(agents).set({ status: 'online', lastSeen: new Date() }).where(eq(agents.id, agentId))

      // Send full config on connect
      void pushFullConfig(agentId)

      // Ping loop
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, PING_INTERVAL_MS)

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as AgentToCentralMsg
          handleAgentMessage(agentId, msg)
        } catch { /* ignore malformed */ }
      })

      ws.on('close', () => {
        clearInterval(ping)
        agentRegistry.deregister(agentId)
        void getDb().update(agents).set({ status: 'offline' }).where(eq(agents.id, agentId))
      })

      ws.on('error', () => {
        clearInterval(ping)
        agentRegistry.deregister(agentId)
        void getDb().update(agents).set({ status: 'error' }).where(eq(agents.id, agentId))
      })
    }).catch(() => ws.close(4001, 'Auth error'))
  })

  server.listen(FEDERATION_WS_PORT, () => {
    console.log(`[federation] WebSocket server listening on :${FEDERATION_WS_PORT}`)
  })
}

function handleAgentMessage(agentId: string, msg: AgentToCentralMsg): void {
  switch (msg.type) {
    case 'pong':
      agentRegistry.updatePing(agentId)
      break

    case 'config.ack':
      if (!msg.success) {
        console.error(`[federation] Agent ${agentId} config apply failed: ${msg.error ?? 'unknown'}`)
        void getDb().update(agents).set({ status: 'error' }).where(eq(agents.id, agentId))
      }
      break

    case 'config.resync_request':
      console.log(`[federation] Agent ${agentId} requested resync: ${msg.reason}`)
      void pushFullConfig(agentId)
      break

    case 'metrics.push':
      void handleMetricsPush(msg)
      agentRegistry.updateSystem(agentId, msg.system.caddyVersion, msg.system.uptimeSeconds)
      void getDb().update(agents)
        .set({ status: 'online', lastSeen: new Date(), caddyVersion: msg.system.caddyVersion })
        .where(eq(agents.id, agentId))
      break

    case 'health.report':
      agentRegistry.updateHealth(agentId, msg.upstreams)
      agentRegistry.updateCerts(agentId, msg.certs)
      break

    case 'log.line':
      logBroker.publish(msg)
      break
  }
}

export type { FederationMsg }
