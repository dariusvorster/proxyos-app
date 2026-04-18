import { WebSocket, WebSocketServer } from 'ws'
import type { IncomingMessage } from 'http'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { getDb, federationNodes, nodeAuthKeys } from '@proxyos/db'
import { eq, and, isNull } from 'drizzle-orm'
import type {
  FederationMessage,
  HelloMessage,
  WelcomeMessage,
  ConfigApplyMessage,
  ConfigAckMessage,
  TelemetryHeartbeatMessage,
} from './protocol'
import { computeConfigForNode } from './config-builder'

interface ConnectedNode {
  agentId: string
  siteId: string
  ws: WebSocket
  lastHeartbeatAt: number
  configVersionApplied: number
}

let instance: FederationServer | null = null

export function getFederationServer(): FederationServer | null {
  return instance
}

export async function startFederationServer(port: number): Promise<FederationServer> {
  const server = new FederationServer(port)
  await server.start()
  instance = server
  return server
}

export class FederationServer {
  private wss: WebSocketServer | null = null
  private connections = new Map<string, ConnectedNode>()

  constructor(private readonly port: number) {}

  async start(): Promise<void> {
    this.wss = new WebSocketServer({
      port: this.port,
      path: '/federation/v1',
      maxPayload: 16 * 1024 * 1024,
      verifyClient: (info, cb) => {
        void this.verifyClient(info as { req: IncomingMessage }, cb)
      },
    })

    this.wss.on('connection', (ws, req) => this.onConnection(ws, req))
    console.log(`[federation] server listening on :${this.port}/federation/v1`)

    setInterval(() => { void this.monitorHeartbeats() }, 10_000)
  }

  async stop(): Promise<void> {
    for (const conn of this.connections.values()) {
      conn.ws.close(1001, 'central shutting down')
    }
    this.wss?.close()
  }

  private async verifyClient(
    info: { req: IncomingMessage },
    cb: (ok: boolean, code?: number, message?: string) => void,
  ): Promise<void> {
    try {
      const url = new URL(info.req.url ?? '/', 'ws://_')
      const nodeId = url.searchParams.get('node_id')
      const authHeader = info.req.headers.authorization

      if (!nodeId || !authHeader?.startsWith('Bearer ')) {
        cb(false, 401, 'missing node_id or auth')
        return
      }

      const authKey = authHeader.slice('Bearer '.length)
      const db = getDb()

      const [node] = await db
        .select()
        .from(federationNodes)
        .where(eq(federationNodes.id, nodeId))

      if (!node || node.status === 'revoked') {
        cb(false, 403, 'node not found or revoked')
        return
      }

      const keys = await db
        .select()
        .from(nodeAuthKeys)
        .where(and(eq(nodeAuthKeys.nodeId, nodeId), isNull(nodeAuthKeys.revokedAt)))

      let matched = false
      for (const k of keys) {
        if (await bcrypt.compare(authKey, k.keyHash)) {
          matched = true
          break
        }
      }

      if (!matched) {
        cb(false, 403, 'invalid auth key')
        return
      }

      ;(info.req as unknown as Record<string, unknown>).nodeId = nodeId
      ;(info.req as unknown as Record<string, unknown>).siteId = node.siteId
      cb(true)
    } catch (err) {
      console.error('[federation] verifyClient error:', err)
      cb(false, 500, 'internal error')
    }
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const r = req as unknown as Record<string, unknown>
    const nodeId = r.nodeId as string
    const siteId = r.siteId as string

    const conn: ConnectedNode = {
      agentId: nodeId,
      siteId,
      ws,
      lastHeartbeatAt: Date.now(),
      configVersionApplied: 0,
    }
    this.connections.set(nodeId, conn)

    console.log(`[federation] node connected: ${nodeId} (site=${siteId})`)

    const db = getDb()
    void db
      .update(federationNodes)
      .set({ status: 'connected', lastHeartbeatAt: new Date() })
      .where(eq(federationNodes.id, nodeId))

    ws.on('message', (data: Buffer | string) => { void this.handleMessage(conn, data.toString()) })
    ws.on('close', () => this.onDisconnect(nodeId))
    ws.on('error', (e: Error) => console.error(`[federation] ws error from ${nodeId}:`, e))
  }

  private async handleMessage(conn: ConnectedNode, raw: string): Promise<void> {
    conn.lastHeartbeatAt = Date.now()
    let msg: FederationMessage
    try {
      msg = JSON.parse(raw) as FederationMessage
    } catch {
      return
    }

    switch (msg.type) {
      case 'hello':
        await this.handleHello(conn, msg as HelloMessage)
        break
      case 'config.ack':
        await this.handleConfigAck(conn, msg as ConfigAckMessage)
        break
      case 'telemetry.heartbeat':
        await this.handleHeartbeat(conn, msg as TelemetryHeartbeatMessage)
        break
      case 'pong':
        break
      default:
        break
    }
  }

  private async handleHello(conn: ConnectedNode, hello: HelloMessage): Promise<void> {
    const db = getDb()
    await db
      .update(federationNodes)
      .set({
        agentVersion: hello.payload.agent_version,
        hostname: hello.payload.hostname,
        osInfo: hello.payload.os,
      })
      .where(eq(federationNodes.id, conn.agentId))

    const config = await computeConfigForNode(conn.siteId)

    const welcome: WelcomeMessage = {
      type: 'welcome',
      request_id: randomUUID(),
      payload: {
        agent_id: conn.agentId,
        site_id: conn.siteId,
        config_version: config.version,
        server_time: Date.now(),
      },
    }
    conn.ws.send(JSON.stringify(welcome))

    const applyMsg: ConfigApplyMessage = {
      type: 'config.apply',
      request_id: randomUUID(),
      payload: config,
    }
    conn.ws.send(JSON.stringify(applyMsg))
  }

  private async handleConfigAck(conn: ConnectedNode, ack: ConfigAckMessage): Promise<void> {
    conn.configVersionApplied = ack.payload.version
    const db = getDb()
    await db
      .update(federationNodes)
      .set({ configVersionApplied: ack.payload.version })
      .where(eq(federationNodes.id, conn.agentId))

    if (!ack.payload.success) {
      console.warn(`[federation] node ${conn.agentId} failed config v${ack.payload.version}: ${ack.payload.error}`)
    }
  }

  private async handleHeartbeat(conn: ConnectedNode, _hb: TelemetryHeartbeatMessage): Promise<void> {
    const db = getDb()
    await db
      .update(federationNodes)
      .set({ lastHeartbeatAt: new Date() })
      .where(eq(federationNodes.id, conn.agentId))
  }

  private onDisconnect(nodeId: string): void {
    this.connections.delete(nodeId)
    console.log(`[federation] node disconnected: ${nodeId}`)
    const db = getDb()
    void db.update(federationNodes).set({ status: 'offline' }).where(eq(federationNodes.id, nodeId))
  }

  private async monitorHeartbeats(): Promise<void> {
    const now = Date.now()
    for (const [nodeId, conn] of this.connections) {
      if (now - conn.lastHeartbeatAt > 90_000) {
        console.warn(`[federation] node ${nodeId} heartbeat missed, closing`)
        conn.ws.close(1001, 'heartbeat missed')
      }
    }
  }

  async pushConfig(nodeId: string): Promise<void> {
    const conn = this.connections.get(nodeId)
    if (!conn) return
    const config = await computeConfigForNode(conn.siteId)
    const msg: ConfigApplyMessage = {
      type: 'config.apply',
      request_id: randomUUID(),
      payload: config,
    }
    conn.ws.send(JSON.stringify(msg))
  }

  async ping(nodeId: string): Promise<void> {
    const conn = this.connections.get(nodeId)
    if (!conn) return
    conn.ws.send(JSON.stringify({
      type: 'cmd.ping',
      request_id: randomUUID(),
      payload: { ts: Date.now() },
    }))
  }

  async revoke(nodeId: string, reason: string): Promise<void> {
    const conn = this.connections.get(nodeId)
    if (conn) {
      conn.ws.send(JSON.stringify({
        type: 'cmd.revoke',
        request_id: randomUUID(),
        payload: { reason },
      }))
      conn.ws.close(1000, 'revoked')
    }
    const db = getDb()
    await db
      .update(nodeAuthKeys)
      .set({ revokedAt: new Date() })
      .where(eq(nodeAuthKeys.nodeId, nodeId))
    await db
      .update(federationNodes)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(federationNodes.id, nodeId))
  }

  get connectedNodeIds(): string[] {
    return Array.from(this.connections.keys())
  }
}
