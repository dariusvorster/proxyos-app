import type { ConnectionAdapter, ConnectionTestResult, ChainNode, RouteConfig } from '../types'

export interface AutheliaCreds {
  configPath: string    // path to configuration.yml on server
}

// Generates the access_control rule YAML snippet for a domain
function generateAccessControlRule(domain: string, policy: 'two_factor' | 'one_factor' | 'bypass' = 'two_factor'): string {
  return [
    `  - domain: '${domain}'`,
    `    policy: ${policy}`,
  ].join('\n')
}

export class AutheliaAdapter implements ConnectionAdapter {
  readonly type = 'authelia' as const

  constructor(
    readonly connectionId: string,
    private readonly creds: AutheliaCreds,
  ) {}

  async test(): Promise<ConnectionTestResult> {
    const start = Date.now()
    try {
      // Check if config path is set — actual file access is server-side and optional
      if (!this.creds.configPath) throw new Error('Config path not set')
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async sync(): Promise<void> {
    // No-op — Authelia config is file-based; sync is manual
  }

  async onRouteCreated(route: RouteConfig): Promise<void> {
    if (!route.ssoEnabled) return
    // Config generation only — admin applies via getConfigSnippet()
    void route
  }

  async onRouteUpdated(route: RouteConfig): Promise<void> {
    await this.onRouteCreated(route)
  }

  async onRouteDeleted(routeId: string): Promise<void> {
    void routeId
  }

  getConfigSnippet(domains: { domain: string; policy: 'two_factor' | 'one_factor' | 'bypass' }[]): string {
    return [
      '# ProxyOS — Authelia access_control rules',
      '# Add these rules to your access_control.rules section in configuration.yml',
      'access_control:',
      '  default_policy: deny',
      '  rules:',
      ...domains.map(d => generateAccessControlRule(d.domain, d.policy)),
    ].join('\n')
  }

  async getChainNodes(routeId: string): Promise<ChainNode[]> {
    return [{
      id: `${routeId}_sso`,
      routeId,
      nodeType: 'sso',
      label: 'Authelia',
      status: 'ok',
      detail: `Config: ${this.creds.configPath}`,
      provider: 'authelia',
      lastCheck: new Date(),
    }]
  }
}
