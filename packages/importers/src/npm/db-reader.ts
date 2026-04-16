import type { ImportedRoute } from '../types'

export interface NPMProxyHost {
  id: number
  domain_names: string[]
  forward_scheme: string
  forward_host: string
  forward_port: number
  ssl_forced: boolean
  access_list_id: number | null
  meta: Record<string, unknown>
}

export function npmHostToProxyOSRoute(host: NPMProxyHost): ImportedRoute {
  const domain = host.domain_names[0] ?? 'unknown'
  const upstream = `${host.forward_host}:${host.forward_port}`
  const hasTLS = host.ssl_forced || Object.keys(host.meta).some(k => k.includes('letsencrypt') || k.includes('ssl'))
  const warnings: string[] = []
  if (host.domain_names.length > 1) warnings.push(`Multiple domains — only first used: ${domain}`)
  if (host.access_list_id) warnings.push('Access list detected — review IP allowlist after import')

  return {
    domain,
    upstream,
    protocol: host.forward_scheme as 'http' | 'https',
    tlsDetected: hasTLS,
    suggestedTlsMode: hasTLS ? 'auto' : 'off',
    ssoDetected: false,
    basicAuthDetected: false,
    compressionDetected: false,
    websocketDetected: false,
    rateLimitDetected: false,
    sourceType: 'npm',
    sourceIdentifier: `npm_proxy_host_${host.id}`,
    confidence: 'high',
    warnings,
    canAutoImport: true,
  }
}

/**
 * Parse a JSON dump of the NPM proxy_host table rows.
 * The caller is responsible for reading the SQLite DB (server-side only).
 */
export function parseNPMRows(rows: NPMProxyHost[]): ImportedRoute[] {
  return rows.map(npmHostToProxyOSRoute)
}
