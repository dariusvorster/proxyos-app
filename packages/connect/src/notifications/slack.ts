import { eventBus } from '../event-bus'

export interface SlackCreds {
  webhookUrl?: string    // Incoming webhook URL (simplest)
  botToken?: string      // Bot token (xoxb-...) for API method
  channel?: string       // Required when using botToken
}

type SlackBlock = { type: string; [k: string]: unknown }

export class SlackAdapter {
  readonly type = 'slack'
  readonly connectionId: string
  private creds: SlackCreds
  private unsubscribe: (() => void)[] = []

  constructor(connectionId: string, creds: SlackCreds) {
    this.connectionId = connectionId
    this.creds = creds
  }

  async getChainNodes(): Promise<[]> { return [] }

  async test(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const t = Date.now()
    try {
      if (this.creds.botToken) {
        const res = await fetch('https://slack.com/api/auth.test', {
          headers: { Authorization: `Bearer ${this.creds.botToken}` },
        })
        const json = await res.json() as { ok: boolean; error?: string }
        return { ok: json.ok, latencyMs: Date.now() - t, error: json.error }
      }
      if (this.creds.webhookUrl) {
        const res = await fetch(this.creds.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'ProxyOS connection test' }),
        })
        return { ok: res.ok, latencyMs: Date.now() - t, error: res.ok ? undefined : `HTTP ${res.status}` }
      }
      return { ok: false, latencyMs: 0, error: 'No webhookUrl or botToken configured' }
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - t, error: String(e) }
    }
  }

  async sync(): Promise<void> { /* no-op */ }

  async sendMessage(channel: string, blocks: SlackBlock[]): Promise<void> {
    if (this.creds.webhookUrl) {
      const res = await fetch(this.creds.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      })
      if (!res.ok) throw new Error(`Slack webhook ${res.status}`)
      return
    }
    if (this.creds.botToken) {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.creds.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel, blocks }),
      })
      const json = await res.json() as { ok: boolean; error?: string }
      if (!json.ok) throw new Error(`Slack API: ${json.error}`)
    }
  }

  private text(msg: string): SlackBlock[] {
    return [{ type: 'section', text: { type: 'mrkdwn', text: msg } }]
  }

  subscribeToEventBus(): void {
    const ch = this.creds.channel ?? '#general'

    this.unsubscribe.push(eventBus.on('upstream.down', (p) => {
      void this.sendMessage(ch, this.text(`*ProxyOS* — upstream down\nRoute: \`${p.routeId}\`\nUpstream: \`${p.upstream}\``)).catch(() => null)
    }))

    this.unsubscribe.push(eventBus.on('cert.expiring', (p) => {
      void this.sendMessage(ch, this.text(`*ProxyOS* — cert expiring\nDomain: \`${p.domain}\`\nExpires in: ${p.daysLeft} days`)).catch(() => null)
    }))

    this.unsubscribe.push(eventBus.on('anomaly.detected', (p) => {
      void this.sendMessage(ch, this.text(`*ProxyOS* — anomaly\nRoute: \`${p.routeId}\`\nMetric: ${p.metric} = ${p.value}`)).catch(() => null)
    }))

    this.unsubscribe.push(eventBus.on('monitor.down', (p) => {
      void this.sendMessage(ch, this.text(`*ProxyOS* — monitor down\nRoute: \`${p.routeId}\`\nMonitor: ${p.monitorId}`)).catch(() => null)
    }))
  }

  destroy(): void {
    for (const unsub of this.unsubscribe) unsub()
    this.unsubscribe = []
  }
}
