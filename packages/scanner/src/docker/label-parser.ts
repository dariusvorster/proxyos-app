import type { ImportedRoute } from '@proxyos/importers'

export const PROXYOS_LABEL_PREFIX = 'proxyos.'

export interface ProxyOSLabels {
  enable: boolean
  domain?: string
  port?: number
  protocol?: 'http' | 'https'
  tls?: 'auto' | 'dns' | 'internal' | 'off'
  sso?: string
  ssoUrl?: string
  ratelimit?: number
  allowlist?: string[]
  compress?: boolean
  websocket?: boolean
  healthcheck?: string
  review?: boolean
}

export function parseProxyOSLabels(labels: Record<string, string>): ProxyOSLabels | null {
  if (labels['proxyos.enable'] !== 'true') return null
  return {
    enable: true,
    domain: labels['proxyos.domain'],
    port: labels['proxyos.port'] ? parseInt(labels['proxyos.port']) : undefined,
    protocol: (labels['proxyos.protocol'] as 'http' | 'https') ?? 'http',
    tls: (labels['proxyos.tls'] as ProxyOSLabels['tls']) ?? 'auto',
    sso: labels['proxyos.sso'],
    ssoUrl: labels['proxyos.sso_url'],
    ratelimit: labels['proxyos.ratelimit'] ? parseInt(labels['proxyos.ratelimit']) : undefined,
    allowlist: labels['proxyos.allowlist']?.split(',').map(s => s.trim()),
    compress: labels['proxyos.compress'] === 'true',
    websocket: labels['proxyos.websocket'] === 'true',
    healthcheck: labels['proxyos.healthcheck'],
    review: labels['proxyos.review'] === 'true',
  }
}

export function proxyOSLabelsToRoute(
  labels: ProxyOSLabels,
  containerName: string,
  containerIp: string,
): ImportedRoute {
  const domain = labels.domain ?? ''
  const upstream = `${containerIp}:${labels.port ?? 80}`
  const warnings: string[] = []
  if (!domain) warnings.push('proxyos.domain label not set — domain must be configured manually')
  if (!labels.port) warnings.push('proxyos.port label not set — defaulting to 80')

  return {
    domain,
    upstream,
    protocol: labels.protocol ?? 'http',
    tlsDetected: labels.tls !== 'off',
    suggestedTlsMode: labels.tls ?? 'auto',
    ssoDetected: !!labels.sso && labels.sso !== 'none',
    ssoProvider: labels.sso !== 'none' ? labels.sso : undefined,
    ssoUrl: labels.ssoUrl,
    basicAuthDetected: false,
    ipAllowlist: labels.allowlist,
    compressionDetected: labels.compress ?? false,
    websocketDetected: labels.websocket ?? false,
    rateLimitDetected: !!labels.ratelimit,
    rateLimitRpm: labels.ratelimit,
    sourceType: 'traefik',  // reuse traefik type for docker containers
    sourceIdentifier: `container:${containerName}`,
    confidence: domain ? 'high' : 'medium',
    warnings,
    canAutoImport: !!(domain && !labels.review),
  }
}
