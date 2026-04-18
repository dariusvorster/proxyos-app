import WebSocket from 'ws'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { createHash, randomUUID } from 'crypto'
import type {
  FederationMessage,
  HelloMessage,
  WelcomeMessage,
  ConfigApplyMessage,
} from './protocol'
import { startHeartbeat, stopHeartbeat } from './heartbeat'
import { startTelemetry, stopTelemetry } from './telemetry-sender'

export interface FederationClientConfig {
  centralUrl: string
  agentToken?: string
  agentName: string
  caCert?: string
  tlsSkipVerify: boolean
  identityPath: string
  reconnectDelayS: number
  maxReconnectDelayS: number
  heartbeatIntervalS: number
  welcomeTimeoutS: number
  onRescan?: () => void
}

interface Identity {
  agent_id: string
  auth_key: string
  central_url: string
  enrolled_at: number
}

export class FederationClient {
  private ws: WebSocket | null = null
  private identity: Identity | null = null
  private stopped = false

  constructor(private readonly config: FederationClientConfig) {}

  async start(): Promise<void> {
    this.identity = this.loadIdentity()
    if (!this.identity) {
      if (!this.config.agentToken) {
        throw new Error('No identity.json and no PROXYOS_AGENT_TOKEN — cannot enroll')
      }
      this.identity = await this.enroll()
      this.saveIdentity(this.identity)
    }
    void this.runWithReconnect()
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'shutdown')
    }
  }

  send(msg: FederationMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(msg))
  }

  get agentId(): string | null {
    return this.identity?.agent_id ?? null
  }

  private loadIdentity(): Identity | null {
    if (!existsSync(this.config.identityPath)) return null
    try {
      return JSON.parse(readFileSync(this.config.identityPath, 'utf-8')) as Identity
    } catch {
      return null
    }
  }

  private saveIdentity(identity: Identity): void {
    mkdirSync(dirname(this.config.identityPath), { recursive: true })
    writeFileSync(this.config.identityPath, JSON.stringify(identity, null, 2), { mode: 0o600 })
  }

  private async enroll(): Promise<Identity> {
    const { centralUrl, agentToken, agentName } = this.config
    const httpUrl = centralUrl
      .replace(/^wss:/, 'https:')
      .replace(/^ws:/, 'http:')
      .replace(/\/federation\/v1\/?$/, '/api/federation/enroll')

    const os = await import('os')

    const res = await fetch(httpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: agentToken,
        agent_name: agentName,
        hostname: os.hostname(),
        os: `${process.platform}/${process.arch}`,
        proxyos_version: process.env.PROXYOS_VERSION ?? 'dev',
      }),
    })

    if (!res.ok) {
      throw new Error(`Enrollment failed: HTTP ${res.status} ${await res.text()}`)
    }

    const { agent_id, auth_key, central_url } = await res.json() as {
      agent_id: string
      auth_key: string
      central_url: string
    }

    console.log(`[federation] enrollment successful — agent_id=${agent_id}`)
    return {
      agent_id,
      auth_key,
      central_url: central_url ?? centralUrl,
      enrolled_at: Math.floor(Date.now() / 1000),
    }
  }

  private async runWithReconnect(): Promise<void> {
    let backoffMs = this.config.reconnectDelayS * 1000
    const maxBackoffMs = this.config.maxReconnectDelayS * 1000

    while (!this.stopped) {
      try {
        await this.connectOnce()
        backoffMs = this.config.reconnectDelayS * 1000
      } catch (e) {
        console.error(`[federation] connection failed: ${e instanceof Error ? e.message : String(e)}`)
      }

      if (this.stopped) return

      const jitter = Math.floor(Math.random() * backoffMs / 2) - backoffMs / 4
      const delayMs = Math.max(1000, backoffMs + jitter)
      console.log(`[federation] reconnecting in ${Math.round(delayMs / 1000)}s…`)
      await sleep(delayMs)
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs)
    }
  }

  private async connectOnce(): Promise<void> {
    if (!this.identity) throw new Error('no identity')

    const wsUrl = `${this.identity.central_url}?node_id=${this.identity.agent_id}`
    const options: WebSocket.ClientOptions = {
      headers: { Authorization: `Bearer ${this.identity.auth_key}` },
      handshakeTimeout: 10_000,
      maxPayload: 16 * 1024 * 1024,
    }

    if (this.config.caCert) {
      options.ca = readFileSync(this.config.caCert)
    }
    if (this.config.tlsSkipVerify) {
      console.warn('[federation] TLS verification disabled — insecure')
      options.rejectUnauthorized = false
    }

    this.ws = new WebSocket(wsUrl, 'proxyos.federation.v1', options)

    return new Promise((resolve, reject) => {
      this.ws!.once('error', reject)
      this.ws!.once('open', async () => {
        try {
          await this.handshake()
          this.runMessageLoop(resolve, reject)
          startHeartbeat(this, this.config.heartbeatIntervalS)
          startTelemetry(this)
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  private async handshake(): Promise<void> {
    if (!this.ws || !this.identity) throw new Error('not connected')

    const os = await import('os')
    const tokenHash = this.config.agentToken
      ? createHash('sha256').update(this.config.agentToken).digest('hex')
      : ''

    const hello: HelloMessage = {
      type: 'hello',
      request_id: randomUUID(),
      payload: {
        agent_id: this.identity.agent_id,
        agent_version: process.env.PROXYOS_VERSION ?? 'dev',
        token_hash: tokenHash,
        hostname: os.hostname(),
        os: `${process.platform}/${process.arch}`,
        docker_version: 'unknown',
        capabilities: ['routes.v1', 'telemetry.v1'],
      },
    }
    this.send(hello)

    const welcome = await this.waitForMessage('welcome', this.config.welcomeTimeoutS * 1000) as WelcomeMessage
    console.log(`[federation] connected — site_id=${welcome.payload.site_id} config_v=${welcome.payload.config_version}`)
  }

  private runMessageLoop(onDisconnect: () => void, onError: (e: Error) => void): void {
    if (!this.ws) return

    const readDeadlineMs = Math.max(this.config.heartbeatIntervalS * 2, 60) * 1000
    let lastMessageAt = Date.now()

    const deadlineCheck = setInterval(() => {
      if (Date.now() - lastMessageAt > readDeadlineMs) {
        console.warn('[federation] read deadline exceeded, reconnecting')
        this.ws?.close(1001, 'read deadline exceeded')
        clearInterval(deadlineCheck)
      }
    }, 5_000)

    this.ws.on('message', (data: Buffer | string) => {
      lastMessageAt = Date.now()
      try {
        const msg = JSON.parse(data.toString()) as FederationMessage
        void this.handleMessage(msg)
      } catch (e) {
        console.error('[federation] failed to parse message:', e)
      }
    })

    this.ws.on('close', (code: number, reason: Buffer) => {
      clearInterval(deadlineCheck)
      stopHeartbeat()
      stopTelemetry()
      console.log(`[federation] connection closed: ${code} ${reason.toString()}`)
      onDisconnect()
    })

    this.ws.on('error', (e: Error) => {
      clearInterval(deadlineCheck)
      stopHeartbeat()
      stopTelemetry()
      onError(e)
    })
  }

  private waitForMessage(type: string, timeoutMs: number): Promise<FederationMessage> {
    if (!this.ws) throw new Error('not connected')
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.ws?.off('message', handler)
        reject(new Error(`timeout waiting for ${type}`))
      }, timeoutMs)

      const handler = (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString()) as FederationMessage
          if (msg.type === type) {
            clearTimeout(timer)
            this.ws?.off('message', handler)
            resolve(msg)
          }
        } catch {
          // ignore malformed during handshake
        }
      }

      this.ws!.on('message', handler)
    })
  }

  private async handleMessage(msg: FederationMessage): Promise<void> {
    switch (msg.type) {
      case 'config.apply':
      case 'config.reconcile': {
        const { applyConfig } = await import('./config-applier')
        await applyConfig(this, msg as ConfigApplyMessage)
        break
      }
      case 'cmd.ping':
        this.send({ type: 'pong', request_id: msg.request_id, payload: { ts: Date.now() } })
        break
      case 'cmd.revoke':
        console.warn(`[federation] revoked by central: ${(msg.payload as { reason: string }).reason}`)
        void this.stop()
        break
      case 'cmd.rescan':
        this.config.onRescan?.()
        break
      default:
        break
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
