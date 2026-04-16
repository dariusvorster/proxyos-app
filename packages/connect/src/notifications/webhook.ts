import { eventBus } from '../event-bus'
import type { ConnectEventMap } from '../event-bus'

export interface WebhookCreds {
  url: string
  secret: string
  events: (keyof ConnectEventMap)[]   // subscribed event types
  retries?: number                 // default 3
  timeout?: number                 // ms, default 5000
}

export interface WebhookDelivery {
  id: string
  connectionId: string
  eventType: string
  url: string
  statusCode: number | null
  responseTimeMs: number
  success: boolean
  error?: string
  payloadPreview: string
  deliveredAt: Date
}

type DeliveryCallback = (d: WebhookDelivery) => void

// HMAC-SHA256 using Web Crypto (available in Node 18+)
async function hmacSign(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export class WebhookAdapter {
  readonly type = 'webhook'
  readonly connectionId: string
  private creds: WebhookCreds
  private unsubscribe: (() => void)[] = []
  private onDelivery?: DeliveryCallback

  constructor(connectionId: string, creds: WebhookCreds) {
    this.connectionId = connectionId
    this.creds = creds
  }

  async getChainNodes(): Promise<[]> { return [] }

  setDeliveryCallback(fn: DeliveryCallback): void {
    this.onDelivery = fn
  }

  async test(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const t = Date.now()
    try {
      const payload = JSON.stringify({ type: 'health_check', timestamp: new Date().toISOString() })
      const sig = await hmacSign(this.creds.secret, payload)
      const res = await fetch(this.creds.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-ProxyOS-Signature': sig },
        body: payload,
        signal: AbortSignal.timeout(this.creds.timeout ?? 5000),
      })
      return { ok: res.ok, latencyMs: Date.now() - t, error: res.ok ? undefined : `HTTP ${res.status}` }
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - t, error: String(e) }
    }
  }

  async sync(): Promise<void> { /* no-op */ }

  async deliver(eventType: string, data: unknown): Promise<WebhookDelivery> {
    const payload = JSON.stringify({ type: eventType, timestamp: new Date().toISOString(), data })
    const sig = await hmacSign(this.creds.secret, payload)
    const retries = this.creds.retries ?? 3
    const timeout = this.creds.timeout ?? 5000
    const start = Date.now()

    let lastError: string | undefined
    let statusCode: number | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(this.creds.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-ProxyOS-Signature': sig },
          body: payload,
          signal: AbortSignal.timeout(timeout),
        })
        statusCode = res.status
        if (res.ok) {
          const d: WebhookDelivery = {
            id: crypto.randomUUID(),
            connectionId: this.connectionId,
            eventType,
            url: this.creds.url,
            statusCode,
            responseTimeMs: Date.now() - start,
            success: true,
            payloadPreview: payload.slice(0, 300),
            deliveredAt: new Date(),
          }
          this.onDelivery?.(d)
          return d
        }
        lastError = `HTTP ${res.status}`
      } catch (e) {
        lastError = String(e)
      }
    }

    const d: WebhookDelivery = {
      id: crypto.randomUUID(),
      connectionId: this.connectionId,
      eventType,
      url: this.creds.url,
      statusCode,
      responseTimeMs: Date.now() - start,
      success: false,
      error: lastError,
      payloadPreview: payload.slice(0, 300),
      deliveredAt: new Date(),
    }
    this.onDelivery?.(d)
    return d
  }

  subscribeToEventBus(): void {
    const subscribed = new Set(this.creds.events)

    const events: (keyof ConnectEventMap)[] = [
      'route.created', 'route.updated', 'route.deleted',
      'cert.expiring', 'upstream.down', 'upstream.up',
      'anomaly.detected', 'monitor.down', 'monitor.up',
      'dns.out_of_sync', 'tunnel.disconnected',
    ]

    for (const ev of events) {
      if (!subscribed.has(ev)) continue
      this.unsubscribe.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eventBus.on(ev as any, (data: unknown) => {
          void this.deliver(ev, data).catch(() => null)
        })
      )
    }
  }

  destroy(): void {
    for (const unsub of this.unsubscribe) unsub()
    this.unsubscribe = []
  }
}
