import { eventBus } from '../event-bus'

export interface ZulipCreds {
  url: string          // e.g. https://chat.example.com
  botEmail: string
  botApiKey: string
  stream: string       // default stream (e.g. #infrastructure)
  topic: string        // default topic (e.g. ProxyOS Alerts)
}

export class ZulipAdapter {
  readonly type = 'zulip'
  readonly connectionId: string
  private creds: ZulipCreds
  private unsubscribe: (() => void)[] = []

  constructor(connectionId: string, creds: ZulipCreds) {
    this.connectionId = connectionId
    this.creds = creds
  }

  async getChainNodes(): Promise<[]> { return [] }

  async test(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const t = Date.now()
    try {
      const res = await fetch(`${this.creds.url}/api/v1/users/me`, {
        headers: { Authorization: `Basic ${btoa(`${this.creds.botEmail}:${this.creds.botApiKey}`)}` },
      })
      return { ok: res.ok, latencyMs: Date.now() - t, error: res.ok ? undefined : `HTTP ${res.status}` }
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - t, error: String(e) }
    }
  }

  async sync(): Promise<void> { /* no-op — event-driven */ }

  async sendMessage(stream: string, topic: string, content: string): Promise<void> {
    const body = new URLSearchParams({
      type: 'stream',
      to: stream,
      topic,
      content,
    })
    const res = await fetch(`${this.creds.url}/api/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${this.creds.botEmail}:${this.creds.botApiKey}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
    if (!res.ok) throw new Error(`Zulip API ${res.status}: ${await res.text()}`)
  }

  subscribeToEventBus(): void {
    const { stream, topic } = this.creds

    this.unsubscribe.push(eventBus.on('upstream.down', (p) => {
      void this.sendMessage(stream, 'ProxyOS Alerts',
        `**ProxyOS Alert** — upstream down\nRoute: \`${p.routeId}\`\nUpstream: \`${p.upstream}\``
      ).catch(() => null)
    }))

    this.unsubscribe.push(eventBus.on('cert.expiring', (p) => {
      void this.sendMessage(stream, 'Cert Expiry',
        `**ProxyOS Alert** — cert expiring\nDomain: \`${p.domain}\`\nExpires in: ${p.daysLeft} days`
      ).catch(() => null)
    }))

    this.unsubscribe.push(eventBus.on('anomaly.detected', (p) => {
      void this.sendMessage(stream, 'Traffic Anomalies',
        `**ProxyOS Alert** — anomaly detected\nRoute: \`${p.routeId}\`\nMetric: ${p.metric} = ${p.value} (baseline ${p.baseline})`
      ).catch(() => null)
    }))

    this.unsubscribe.push(eventBus.on('monitor.down', (p) => {
      void this.sendMessage(stream, topic,
        `**ProxyOS Alert** — monitor down\nRoute: \`${p.routeId}\`\nMonitor: ${p.monitorId}`
      ).catch(() => null)
    }))
  }

  destroy(): void {
    for (const unsub of this.unsubscribe) unsub()
    this.unsubscribe = []
  }
}
