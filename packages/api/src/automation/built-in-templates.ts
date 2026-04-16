export interface RouteTemplateConfig {
  tlsMode?: string
  ssoEnabled?: boolean
  rateLimit?: { enabled: boolean; rpm: number } | null
  compressionEnabled?: boolean
  healthCheckEnabled?: boolean
  geoipBlock?: boolean
  monitoring?: boolean
  headers?: Record<string, string>
}

export interface BuiltInTemplate {
  id: string
  name: string
  description: string
  config: RouteTemplateConfig
}

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: 'tpl_public_saas',
    name: 'Public SaaS endpoint',
    description: 'Auto TLS, Authentik SSO, 100 rpm rate limit, high-risk country block, Uptime Kuma monitor',
    config: {
      tlsMode: 'auto',
      ssoEnabled: true,
      rateLimit: { enabled: true, rpm: 100 },
      compressionEnabled: true,
      healthCheckEnabled: true,
      geoipBlock: true,
      monitoring: true,
    },
  },
  {
    id: 'tpl_homelab_internal',
    name: 'Internal homelab service',
    description: 'Internal CA, Authentik SSO, no rate limit, no external monitoring',
    config: {
      tlsMode: 'internal',
      ssoEnabled: true,
      rateLimit: null,
      compressionEnabled: true,
      healthCheckEnabled: true,
      geoipBlock: false,
      monitoring: false,
    },
  },
  {
    id: 'tpl_public_api',
    name: 'Public API endpoint',
    description: 'Auto TLS, JWT validation, 1000 rpm rate limit, no SSO, Uptime Kuma monitor',
    config: {
      tlsMode: 'auto',
      ssoEnabled: false,
      rateLimit: { enabled: true, rpm: 1000 },
      compressionEnabled: true,
      healthCheckEnabled: true,
      geoipBlock: false,
      monitoring: true,
    },
  },
  {
    id: 'tpl_static_simple',
    name: 'Static / simple service',
    description: 'Auto TLS, no SSO, compression on, no rate limit',
    config: {
      tlsMode: 'auto',
      ssoEnabled: false,
      rateLimit: null,
      compressionEnabled: true,
      healthCheckEnabled: false,
      geoipBlock: false,
      monitoring: false,
    },
  },
]
