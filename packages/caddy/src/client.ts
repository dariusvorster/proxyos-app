import type { CaddyRoute } from './types'
import { caddyRouteId } from './config'

export interface CaddyClientOptions {
  baseUrl?: string
  serverName?: string
}

export class CaddyClient {
  private readonly baseUrl: string
  private readonly serverName: string

  constructor(opts: CaddyClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019'
    this.serverName = opts.serverName ?? 'main'
  }

  private get adminHeaders(): HeadersInit {
    return { 'Origin': this.baseUrl }
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/config/`, { headers: this.adminHeaders })
      return res.ok
    } catch {
      return false
    }
  }

  async getConfig(): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/config/`, { headers: this.adminHeaders })
    if (!res.ok) throw new Error(`Caddy getConfig failed: ${res.status}`)
    return res.json()
  }

  async loadConfig(config: unknown): Promise<void> {
    const res = await this.fetchJson(`${this.baseUrl}/load`, { method: 'POST', body: config })
    if (!res.ok) throw new Error(`Caddy loadConfig failed: ${res.status} ${await res.text()}`)
  }

  async hasServer(name: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/config/apps/http/servers/${name}`, { headers: this.adminHeaders })
    if (res.status === 404) return false
    if (!res.ok) return false
    const body = await res.text()
    return body !== 'null' && body.length > 0
  }

  async replaceRoutes(serverName: string, routes: CaddyRoute[]): Promise<void> {
    const url = `${this.baseUrl}/config/apps/http/servers/${serverName}/routes`
    const res = await this.fetchJson(url, { method: 'PATCH', body: routes })
    if (!res.ok) throw new Error(`Caddy replaceRoutes failed: ${res.status} ${await res.text()}`)
  }

  async ensureTlsAppExists(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/config/apps/tls`, { headers: this.adminHeaders })
    const text = await res.text()
    if (!res.ok || text === 'null') {
      const initRes = await this.fetchJson(`${this.baseUrl}/config/apps/tls`, {
        method: 'PUT',
        body: { automation: { policies: [] } },
      })
      if (!initRes.ok) {
        throw new Error(`Caddy TLS app init failed: ${initRes.status} ${await initRes.text()}`)
      }
    }
  }

  async upsertTlsPolicy(policy: unknown): Promise<void> {
    const policiesUrl = `${this.baseUrl}/config/apps/tls/automation/policies`
    const policySubjects: string[] = (policy as { subjects?: string[] }).subjects ?? []

    const getRes = await fetch(policiesUrl, { headers: this.adminHeaders })
    const getText = await getRes.text()

    // TLS app or automation path doesn't exist yet — initialize it.
    if (!getRes.ok || getText === 'null' || getText === '') {
      const initRes = await this.fetchJson(`${this.baseUrl}/config/apps/tls`, {
        method: 'PUT',
        body: { automation: { policies: [policy] } },
      })
      if (!initRes.ok) {
        throw new Error(`Caddy upsertTlsPolicy init failed: ${initRes.status} ${await initRes.text()}`)
      }
      return
    }

    let existing: Array<{ subjects?: string[] }>
    try {
      const parsed = JSON.parse(getText)
      existing = Array.isArray(parsed) ? parsed : []
    } catch {
      existing = []
    }

    // Strip ALL existing policies that cover any of our subjects (handles pre-existing
    // duplicates), then append the new policy, and PUT the entire array back atomically.
    // This is safer than per-index replace because it self-heals any prior duplicates.
    const deduped = [
      ...existing.filter(p =>
        !(p.subjects ?? []).some(s => policySubjects.includes(s))
      ),
      policy,
    ]

    const putRes = await this.fetchJson(policiesUrl, { method: 'PATCH', body: deduped })
    if (!putRes.ok) throw new Error(`Caddy upsertTlsPolicy failed: ${putRes.status} ${await putRes.text()}`)
  }

  async addRoute(route: CaddyRoute): Promise<void> {
    const url = `${this.baseUrl}/config/apps/http/servers/${this.serverName}/routes`
    const res = await this.fetchJson(url, { method: 'POST', body: route })
    if (!res.ok) {
      throw new Error(`Caddy addRoute failed: ${res.status} ${await res.text()}`)
    }
  }

  async updateRoute(routeId: string, route: CaddyRoute): Promise<void> {
    const url = `${this.baseUrl}/id/${caddyRouteId(routeId)}`
    const res = await this.fetchJson(url, { method: 'PATCH', body: route })
    if (!res.ok) {
      throw new Error(`Caddy updateRoute failed: ${res.status} ${await res.text()}`)
    }
  }

  async removeRoute(routeId: string): Promise<void> {
    const url = `${this.baseUrl}/id/${caddyRouteId(routeId)}`
    const res = await fetch(url, { method: 'DELETE', headers: this.adminHeaders })
    if (!res.ok && res.status !== 404) {
      throw new Error(`Caddy removeRoute failed: ${res.status} ${await res.text()}`)
    }
  }

  async setHttpRedirectServer(): Promise<void> {
    const url = `${this.baseUrl}/config/apps/http/servers/http_redirect`
    const config = {
      listen: [':80'],
      routes: [{
        handle: [{
          handler: 'static_response',
          status_code: 308,
          headers: {
            Location: ['https://{http.request.host}{http.request.uri}'],
          },
        }],
      }],
    }
    const res = await this.fetchJson(url, { method: 'PUT', body: config })
    if (!res.ok) throw new Error(`Caddy setHttpRedirectServer failed: ${res.status} ${await res.text()}`)
  }

  async setServerErrors(serverName: string, errorsConfig: unknown): Promise<void> {
    const url = `${this.baseUrl}/config/apps/http/servers/${serverName}/errors`
    const res = await this.fetchJson(url, { method: 'PATCH', body: errorsConfig })
    if (!res.ok) {
      const text = await res.text()
      if (res.status === 404) {
        const putRes = await this.fetchJson(url, { method: 'PUT', body: errorsConfig })
        if (!putRes.ok) throw new Error(`Caddy setServerErrors failed: ${putRes.status} ${await putRes.text()}`)
        return
      }
      throw new Error(`Caddy setServerErrors failed: ${res.status} ${text}`)
    }
  }

  async removeHttpRedirectServer(): Promise<void> {
    const url = `${this.baseUrl}/config/apps/http/servers/http_redirect`
    const res = await fetch(url, { method: 'DELETE', headers: this.adminHeaders })
    if (!res.ok && res.status !== 404) {
      throw new Error(`Caddy removeHttpRedirectServer failed: ${res.status} ${await res.text()}`)
    }
  }

  async addLayerFourStream(stream: {
    id: string
    listenPort: number
    protocol: string
    upstreamHost: string
    upstreamPort: number
  }): Promise<void> {
    const serverKey = `stream_${stream.id}`
    const listenAddr = stream.protocol === 'udp'
      ? `udp//:${stream.listenPort}`
      : `:${stream.listenPort}`
    const body = {
      listen: [listenAddr],
      routes: [{
        handle: [{
          handler: 'proxy',
          upstreams: [{ dial: `${stream.upstreamHost}:${stream.upstreamPort}` }],
        }],
      }],
    }
    const url = `${this.baseUrl}/config/apps/layer4/servers/${serverKey}`
    const res = await this.fetchJson(url, { method: 'PUT', body })
    if (!res.ok) {
      throw new Error(`Caddy addLayerFourStream failed: ${res.status} ${await res.text()}`)
    }
  }

  async removeLayerFourStream(streamId: string): Promise<void> {
    const url = `${this.baseUrl}/config/apps/layer4/servers/stream_${streamId}`
    const res = await fetch(url, { method: 'DELETE', headers: this.adminHeaders })
    if (!res.ok && res.status !== 404) {
      throw new Error(`Caddy removeLayerFourStream failed: ${res.status} ${await res.text()}`)
    }
  }

  private fetchJson(url: string, init: { method: string; body: unknown }) {
    return fetch(url, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', ...this.adminHeaders },
      body: JSON.stringify(init.body),
    })
  }
}
