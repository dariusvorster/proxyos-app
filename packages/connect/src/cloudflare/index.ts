import type { ConnectionAdapter, ConnectionTestResult, ChainNode, RouteConfig } from '../types'
import { cfVerifyToken, cfListDnsRecords, cfEnsureDnsRecord, cfDeleteDnsRecord, cfFindDnsRecord } from './dns'
import type { CfDnsRecord } from './dns'
import { cfListTunnels, cfUpsertTunnelRoute, cfRemoveTunnelRoute } from './tunnel'
import type { CfTunnel } from './tunnel'
import { cfGetWafStatus } from './waf'
import type { WafStatus } from './waf'
import { cfGetZoneAnalytics } from './analytics'
import type { ZoneAnalytics } from './analytics'
import { cfEnsureAccessApp, cfDeleteAccessApp, cfFindAccessApp } from './access'
import type { CfAccessApp } from './access'

export interface CloudflareCreds {
  apiToken: string
  accountId: string
  zoneId?: string
  originIp?: string
  tunnelId?: string
}

export class CloudflareAdapter implements ConnectionAdapter {
  readonly type = 'cloudflare' as const

  constructor(
    readonly connectionId: string,
    private readonly creds: CloudflareCreds,
  ) {}

  async test(): Promise<ConnectionTestResult> {
    const start = Date.now()
    try {
      const ok = await cfVerifyToken(this.creds.apiToken)
      return { ok, latencyMs: Date.now() - start, error: ok ? undefined : 'Token inactive or invalid' }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async sync(): Promise<void> {
    // Base sync: verify token is valid. Shadow table sync is done by API layer via getDnsRecords().
    const ok = await cfVerifyToken(this.creds.apiToken)
    if (!ok) throw new Error('Cloudflare token invalid or expired')
  }

  // CF-specific: returns all DNS records for shadow table sync (API layer writes to DB)
  async getDnsRecords(): Promise<CfDnsRecord[]> {
    if (!this.creds.zoneId) return []
    return cfListDnsRecords(this.creds.apiToken, this.creds.zoneId)
  }

  async getTunnels(): Promise<CfTunnel[]> {
    return cfListTunnels(this.creds.apiToken, this.creds.accountId)
  }

  async getWafStatus(): Promise<WafStatus | null> {
    if (!this.creds.zoneId) return null
    return cfGetWafStatus(this.creds.apiToken, this.creds.zoneId)
  }

  async getAnalytics(since: Date, until: Date): Promise<ZoneAnalytics> {
    if (!this.creds.zoneId) {
      return { requests: { total: 0, cached: 0 }, bandwidth: { total: 0, cached: 0 }, threats: 0, pageviews: 0 }
    }
    return cfGetZoneAnalytics(this.creds.apiToken, this.creds.zoneId, since, until)
  }

  async onRouteCreated(route: RouteConfig): Promise<void> {
    if (this.creds.zoneId && this.creds.originIp) {
      await cfEnsureDnsRecord(this.creds.apiToken, this.creds.zoneId, route.domain, this.creds.originIp)
    }
    if (this.creds.tunnelId) {
      const upstream = (JSON.parse(route.upstreams) as { address: string }[])[0]?.address
      if (upstream) {
        await cfUpsertTunnelRoute(
          this.creds.apiToken, this.creds.accountId, this.creds.tunnelId,
          route.domain, `http://${upstream}`,
        )
      }
    }
  }

  async onRouteUpdated(route: RouteConfig): Promise<void> {
    if (this.creds.zoneId && this.creds.originIp) {
      await cfEnsureDnsRecord(this.creds.apiToken, this.creds.zoneId, route.domain, this.creds.originIp)
    }
  }

  async onRouteDeleted(routeId: string): Promise<void> {
    // routeId only — domain must be provided by API layer via deleteDnsForDomain()
    void routeId
  }

  async deleteDnsForDomain(domain: string): Promise<void> {
    if (this.creds.zoneId) {
      const record = await cfFindDnsRecord(this.creds.apiToken, this.creds.zoneId, domain)
      if (record) await cfDeleteDnsRecord(this.creds.apiToken, this.creds.zoneId, record.id)
    }
    if (this.creds.tunnelId) {
      await cfRemoveTunnelRoute(this.creds.apiToken, this.creds.accountId, this.creds.tunnelId, domain)
    }
  }

  async ensureAccessApp(domain: string, name: string): Promise<CfAccessApp> {
    return cfEnsureAccessApp(this.creds.apiToken, this.creds.accountId, domain, name)
  }

  async deleteAccessApp(domain: string): Promise<void> {
    const app = await cfFindAccessApp(this.creds.apiToken, this.creds.accountId, domain)
    if (app) await cfDeleteAccessApp(this.creds.apiToken, this.creds.accountId, app.id)
  }

  async getChainNodes(routeId: string): Promise<ChainNode[]> {
    void routeId
    return []
  }

  // CF-specific: builds chain nodes given the route's domain
  async getChainNodesForDomain(routeId: string, domain: string): Promise<ChainNode[]> {
    const nodes: ChainNode[] = []

    if (this.creds.zoneId) {
      nodes.push(await this.buildDnsNode(routeId, domain))
    }

    if (this.creds.tunnelId) {
      nodes.push({
        id: `${routeId}_tunnel`,
        routeId,
        nodeType: 'tunnel',
        label: 'CF Tunnel',
        status: 'ok',
        detail: `Tunnel ${this.creds.tunnelId.slice(0, 8)}…`,
        provider: 'cloudflare',
        lastCheck: new Date(),
      })
    }

    if (this.creds.zoneId) {
      try {
        const waf = await cfGetWafStatus(this.creds.apiToken, this.creds.zoneId)
        nodes.push({
          id: `${routeId}_edge_waf`,
          routeId,
          nodeType: 'edge_waf',
          label: 'CF WAF',
          status: 'ok',
          detail: waf.botFightMode ? 'Bot fight mode ON' : 'Bot fight mode OFF',
          provider: 'cloudflare',
          lastCheck: new Date(),
        })
      } catch { /* WAF check is optional */ }
    }

    return nodes
  }

  private async buildDnsNode(routeId: string, domain: string): Promise<ChainNode> {
    try {
      const record = await cfFindDnsRecord(this.creds.apiToken, this.creds.zoneId!, domain)
      if (!record) {
        return {
          id: `${routeId}_dns`,
          routeId,
          nodeType: 'dns',
          label: 'DNS',
          status: 'error',
          detail: `No record for ${domain}`,
          warning: 'Create A record pointing to your proxy IP',
          provider: 'cloudflare',
          lastCheck: new Date(),
        }
      }
      const mismatch = this.creds.originIp && record.content !== this.creds.originIp
      return {
        id: `${routeId}_dns`,
        routeId,
        nodeType: 'dns',
        label: 'DNS',
        status: mismatch ? 'warning' : 'ok',
        detail: `${record.type} ${record.content}${record.proxied ? ' · proxied' : ''}`,
        warning: mismatch ? `Expected ${this.creds.originIp}, got ${record.content}` : undefined,
        provider: 'cloudflare',
        lastCheck: new Date(),
      }
    } catch (err) {
      return {
        id: `${routeId}_dns`,
        routeId,
        nodeType: 'dns',
        label: 'DNS',
        status: 'error',
        detail: err instanceof Error ? err.message : 'DNS lookup failed',
        provider: 'cloudflare',
        lastCheck: new Date(),
      }
    }
  }
}
