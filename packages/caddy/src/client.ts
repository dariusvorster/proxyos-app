import type { CaddyRoute } from './types'
import { caddyRouteId } from './config'
import { request as httpRequest } from 'http'

export interface CaddyClientOptions {
  baseUrl?: string
  serverName?: string
  maxRetries?: number
  retryDelayMs?: number
}

interface AdminResponse {
  ok: boolean
  status: number
  text(): Promise<string>
}

const TRANSIENT_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ENOTCONN', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH'])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class CaddyClient {
  private readonly baseUrl: string
  private readonly serverName: string
  private readonly maxRetries: number
  private readonly retryDelayMs: number

  constructor(opts: CaddyClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019'
    this.serverName = opts.serverName ?? 'main'
    this.maxRetries = opts.maxRetries ?? 3
    this.retryDelayMs = opts.retryDelayMs ?? 500
  }

  async health(): Promise<boolean> {
    try {
      const res = await this.doRequest(`${this.baseUrl}/config/`, 'GET')
      return res.ok
    } catch {
      return false
    }
  }

  async getConfig(): Promise<unknown> {
    const res = await this.doRequest(`${this.baseUrl}/config/`, 'GET')
    if (!res.ok) throw new Error(`Caddy getConfig failed: ${res.status}`)
    return JSON.parse(await res.text())
  }

  async loadConfig(config: unknown): Promise<void> {
    const res = await this.doRequest(`${this.baseUrl}/load`, 'POST', config)
    if (!res.ok) throw new Error(`Caddy loadConfig failed: ${res.status} ${await res.text()}`)
  }

  async hasServer(name: string): Promise<boolean> {
    const res = await this.doRequest(`${this.baseUrl}/config/apps/http/servers/${name}`, 'GET')
    if (res.status === 404) return false
    if (!res.ok) return false
    const body = await res.text()
    return body !== 'null' && body.length > 0
  }

  async replaceRoutes(serverName: string, routes: CaddyRoute[]): Promise<void> {
    const url = `${this.baseUrl}/config/apps/http/servers/${serverName}/routes`
    const res = await this.doRequest(url, 'PATCH', routes)
    if (!res.ok) throw new Error(`Caddy replaceRoutes failed: ${res.status} ${await res.text()}`)
  }

  async ensureTlsAppExists(): Promise<void> {
    const res = await this.doRequest(`${this.baseUrl}/config/apps/tls`, 'GET')
    const text = await res.text()
    if (!res.ok || text === 'null') {
      const initRes = await this.doRequest(`${this.baseUrl}/config/apps/tls`, 'PUT', { automation: { policies: [] } })
      if (!initRes.ok) {
        throw new Error(`Caddy TLS app init failed: ${initRes.status} ${await initRes.text()}`)
      }
    }
  }

  async upsertTlsPolicy(policy: unknown): Promise<void> {
    const policiesUrl = `${this.baseUrl}/config/apps/tls/automation/policies`
    const policySubjects: string[] = (policy as { subjects?: string[] }).subjects ?? []

    const getRes = await this.doRequest(policiesUrl, 'GET')
    const getText = await getRes.text()

    if (!getRes.ok || getText === 'null' || getText === '') {
      const initRes = await this.doRequest(`${this.baseUrl}/config/apps/tls`, 'PUT', { automation: { policies: [policy] } })
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

    const deduped = [
      ...existing.filter(p => !(p.subjects ?? []).some(s => policySubjects.includes(s))),
      policy,
    ]

    const putRes = await this.doRequest(policiesUrl, 'PATCH', deduped)
    if (!putRes.ok) throw new Error(`Caddy upsertTlsPolicy failed: ${putRes.status} ${await putRes.text()}`)
  }

  async upsertTlsConnectionPolicy(domain: string, policy: unknown): Promise<void> {
    const url = `${this.baseUrl}/config/apps/http/servers/${this.serverName}/tls_connection_policies`
    const getRes = await this.doRequest(url, 'GET')
    const getText = await getRes.text()

    let existing: Array<{ match?: { sni?: string[] } }>
    if (!getRes.ok || getText === 'null' || getText === '') {
      existing = []
    } else {
      try {
        const parsed = JSON.parse(getText)
        existing = Array.isArray(parsed) ? parsed : []
      } catch {
        existing = []
      }
    }

    const catchAll = existing.find(p => !p.match)
    const withMatch = existing.filter(p => p.match && !(p.match.sni ?? []).includes(domain))
    const updated = [...withMatch, policy, ...(catchAll ? [catchAll] : [])]

    const putRes = await this.doRequest(url, 'PATCH', updated)
    if (!putRes.ok) throw new Error(`Caddy upsertTlsConnectionPolicy failed: ${putRes.status} ${await putRes.text()}`)
  }

  async removeTlsConnectionPolicy(domain: string): Promise<void> {
    const url = `${this.baseUrl}/config/apps/http/servers/${this.serverName}/tls_connection_policies`
    const getRes = await this.doRequest(url, 'GET')
    const getText = await getRes.text()
    if (!getRes.ok || getText === 'null' || getText === '') return
    let existing: Array<{ match?: { sni?: string[] } }>
    try {
      const parsed = JSON.parse(getText)
      existing = Array.isArray(parsed) ? parsed : []
    } catch {
      return
    }
    const updated = existing.filter(p => !(p.match?.sni ?? []).includes(domain))
    const res = await this.doRequest(url, 'PATCH', updated)
    if (!res.ok && res.status !== 404) throw new Error(`Caddy removeTlsConnectionPolicy failed: ${res.status} ${await res.text()}`)
  }

  async addRoute(route: CaddyRoute): Promise<void> {
    const url = `${this.baseUrl}/config/apps/http/servers/${this.serverName}/routes`
    const res = await this.doRequest(url, 'POST', route)
    if (!res.ok) throw new Error(`Caddy addRoute failed: ${res.status} ${await res.text()}`)
  }

  async updateRoute(routeId: string, route: CaddyRoute): Promise<void> {
    const url = `${this.baseUrl}/id/${caddyRouteId(routeId)}`
    const res = await this.doRequest(url, 'PATCH', route)
    if (!res.ok) throw new Error(`Caddy updateRoute failed: ${res.status} ${await res.text()}`)
  }

  async removeRoute(routeId: string): Promise<void> {
    const url = `${this.baseUrl}/id/${caddyRouteId(routeId)}`
    const res = await this.doRequest(url, 'DELETE')
    if (!res.ok && res.status !== 404) throw new Error(`Caddy removeRoute failed: ${res.status} ${await res.text()}`)
  }

  async setHttpRedirectServer(): Promise<void> {
    const url = `${this.baseUrl}/config/apps/http/servers/http_redirect`
    const config = {
      listen: [':80'],
      routes: [{ handle: [{ handler: 'static_response', status_code: 308, headers: { Location: ['https://{http.request.host}{http.request.uri}'] } }] }],
    }
    const res = await this.doRequest(url, 'PUT', config)
    if (!res.ok) throw new Error(`Caddy setHttpRedirectServer failed: ${res.status} ${await res.text()}`)
  }

  async setServerErrors(serverName: string, errorsConfig: unknown): Promise<void> {
    const url = `${this.baseUrl}/config/apps/http/servers/${serverName}/errors`
    const res = await this.doRequest(url, 'PATCH', errorsConfig)
    if (!res.ok) {
      const text = await res.text()
      if (res.status === 404) {
        const putRes = await this.doRequest(url, 'PUT', errorsConfig)
        if (!putRes.ok) throw new Error(`Caddy setServerErrors failed: ${putRes.status} ${await putRes.text()}`)
        return
      }
      throw new Error(`Caddy setServerErrors failed: ${res.status} ${text}`)
    }
  }

  async removeHttpRedirectServer(): Promise<void> {
    const url = `${this.baseUrl}/config/apps/http/servers/http_redirect`
    const res = await this.doRequest(url, 'DELETE')
    if (!res.ok && res.status !== 404) throw new Error(`Caddy removeHttpRedirectServer failed: ${res.status} ${await res.text()}`)
  }

  async addLayerFourStream(stream: {
    id: string
    listenPort: number
    protocol: string
    upstreamHost: string
    upstreamPort: number
  }): Promise<void> {
    const serverKey = `stream_${stream.id}`
    const listenAddr = stream.protocol === 'udp' ? `udp//:${stream.listenPort}` : `:${stream.listenPort}`
    const body = {
      listen: [listenAddr],
      routes: [{ handle: [{ handler: 'proxy', upstreams: [{ dial: `${stream.upstreamHost}:${stream.upstreamPort}` }] }] }],
    }
    const url = `${this.baseUrl}/config/apps/layer4/servers/${serverKey}`
    const res = await this.doRequest(url, 'PUT', body)
    if (!res.ok) throw new Error(`Caddy addLayerFourStream failed: ${res.status} ${await res.text()}`)
  }

  async removeLayerFourStream(streamId: string): Promise<void> {
    const url = `${this.baseUrl}/config/apps/layer4/servers/stream_${streamId}`
    const res = await this.doRequest(url, 'DELETE')
    if (!res.ok && res.status !== 404) throw new Error(`Caddy removeLayerFourStream failed: ${res.status} ${await res.text()}`)
  }

  private async doRequest(url: string, method: string, body?: unknown): Promise<AdminResponse> {
    let lastError: unknown = null
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.doRequestOnce(url, method, body)
      } catch (e) {
        lastError = e
        const code = (e as NodeJS.ErrnoException).code ?? ''
        if (!TRANSIENT_CODES.has(code) || attempt === this.maxRetries) throw e
        await sleep(this.retryDelayMs * (attempt + 1))
      }
    }
    throw lastError
  }

  private doRequestOnce(url: string, method: string, body?: unknown): Promise<AdminResponse> {
    const parsed = new URL(url)
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined
    const headers: Record<string, string> = { 'Origin': this.baseUrl }
    if (bodyStr !== undefined) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = Buffer.byteLength(bodyStr).toString()
    }
    return new Promise((resolve, reject) => {
      const req = httpRequest({
        hostname: parsed.hostname,
        port: Number(parsed.port) || 80,
        path: parsed.pathname + (parsed.search ?? ''),
        method,
        headers,
      }, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          const status = res.statusCode ?? 0
          resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(data) })
        })
      })
      req.on('error', reject)
      if (bodyStr !== undefined) req.write(bodyStr)
      req.end()
    })
  }
}
