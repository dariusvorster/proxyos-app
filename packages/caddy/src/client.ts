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

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/config/`)
      return res.ok
    } catch {
      return false
    }
  }

  async getConfig(): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/config/`)
    if (!res.ok) throw new Error(`Caddy getConfig failed: ${res.status}`)
    return res.json()
  }

  async loadConfig(config: unknown): Promise<void> {
    const res = await this.fetchJson(`${this.baseUrl}/load`, { method: 'POST', body: config })
    if (!res.ok) throw new Error(`Caddy loadConfig failed: ${res.status} ${await res.text()}`)
  }

  async hasServer(name: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/config/apps/http/servers/${name}`)
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

  async upsertTlsPolicy(policy: unknown): Promise<void> {
    const policiesUrl = `${this.baseUrl}/config/apps/tls/automation/policies`

    const getRes = await fetch(policiesUrl)
    const getText = await getRes.text()

    // Any non-ok response (404, 500 "invalid traversal path", etc.) or null body
    // means the tls app or automation path doesn't exist yet — initialize it via PUT.
    if (!getRes.ok || getText === 'null') {
      const initRes = await this.fetchJson(`${this.baseUrl}/config/apps/tls`, {
        method: 'PUT',
        body: { automation: { policies: [policy] } },
      })
      if (!initRes.ok) {
        throw new Error(`Caddy upsertTlsPolicy init failed: ${initRes.status} ${await initRes.text()}`)
      }
      return
    }

    // policies array exists — append
    const res = await this.fetchJson(policiesUrl, { method: 'POST', body: policy })
    if (!res.ok) throw new Error(`Caddy upsertTlsPolicy failed: ${res.status} ${await res.text()}`)
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
    const res = await fetch(url, { method: 'DELETE' })
    if (!res.ok && res.status !== 404) {
      throw new Error(`Caddy removeRoute failed: ${res.status} ${await res.text()}`)
    }
  }

  private fetchJson(url: string, init: { method: string; body: unknown }) {
    return fetch(url, {
      method: init.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(init.body),
    })
  }
}
