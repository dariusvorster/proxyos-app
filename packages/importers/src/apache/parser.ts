import type { ImportedRoute } from '../types'

interface ApacheVirtualHost {
  serverName: string
  serverAliases: string[]
  port: number
  ssl: boolean
  proxyPass?: string
  proxyPassReverse?: string
  authType?: string
  requireIp?: string[]
}

export function parseApacheConfig(content: string): ApacheVirtualHost[] {
  const vhosts: ApacheVirtualHost[] = []
  const vhostRe = /<VirtualHost[^>]*>([^<]*(?:<[^/][^>]*>[^<]*<\/[^>]+>[^<]*)*)<\/VirtualHost>/gis
  for (const m of content.matchAll(vhostRe)) {
    const body = m[1] ?? ''
    const vhost = parseVirtualHostBody(body, m[0] ?? '')
    if (vhost) vhosts.push(vhost)
  }
  return vhosts
}

function parseVirtualHostBody(body: string, raw: string): ApacheVirtualHost | null {
  let serverName = ''
  const serverAliases: string[] = []
  let ssl = false
  let proxyPass: string | undefined
  let proxyPassReverse: string | undefined
  let authType: string | undefined
  const requireIp: string[] = []

  // Extract port from <VirtualHost *:443>
  const portMatch = raw.match(/<VirtualHost[^:>]*:(\d+)>/)
  const port = portMatch ? parseInt(portMatch[1] ?? '80') : 80
  if (port === 443) ssl = true

  for (const line of body.split('\n')) {
    const t = line.trim()
    if (t.match(/^ServerName\s+/i)) {
      serverName = t.replace(/^ServerName\s+/i, '').trim()
    } else if (t.match(/^ServerAlias\s+/i)) {
      serverAliases.push(...t.replace(/^ServerAlias\s+/i, '').trim().split(/\s+/))
    } else if (t.match(/^SSLEngine\s+on/i)) {
      ssl = true
    } else if (t.match(/^ProxyPass\s+/i) && !t.includes('ProxyPassReverse')) {
      const parts = t.replace(/^ProxyPass\s+/i, '').trim().split(/\s+/)
      if (parts.length >= 2) proxyPass = parts[1]
    } else if (t.match(/^ProxyPassReverse\s+/i)) {
      const parts = t.replace(/^ProxyPassReverse\s+/i, '').trim().split(/\s+/)
      if (parts.length >= 2) proxyPassReverse = parts[1]
    } else if (t.match(/^AuthType\s+/i)) {
      authType = t.replace(/^AuthType\s+/i, '').trim()
    } else if (t.match(/^Require\s+ip\s+/i)) {
      requireIp.push(...t.replace(/^Require\s+ip\s+/i, '').trim().split(/\s+/))
    }
  }

  if (!serverName) return null
  return { serverName, serverAliases, port, ssl, proxyPass, proxyPassReverse, authType, requireIp }
}

function extractUpstream(proxyPass: string): string {
  try {
    const url = new URL(proxyPass)
    return `${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)}`
  } catch {
    return proxyPass.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}

export function apacheVhostToProxyOSRoute(vhost: ApacheVirtualHost): ImportedRoute {
  const upstream = vhost.proxyPass ? extractUpstream(vhost.proxyPass) : ''
  const warnings: string[] = []
  if (!upstream) warnings.push('No ProxyPass directive found — upstream must be set manually')
  if (vhost.authType === 'Basic') warnings.push('Basic auth detected — not auto-imported')

  return {
    domain: vhost.serverName,
    upstream,
    protocol: vhost.ssl ? 'https' : 'http',
    tlsDetected: vhost.ssl,
    suggestedTlsMode: vhost.ssl ? 'auto' : 'off',
    ssoDetected: false,
    basicAuthDetected: vhost.authType === 'Basic',
    ipAllowlist: (vhost.requireIp ?? []).length > 0 ? vhost.requireIp : undefined,
    compressionDetected: false,
    websocketDetected: false,
    rateLimitDetected: false,
    sourceType: 'apache',
    sourceIdentifier: `ServerName ${vhost.serverName}`,
    confidence: upstream ? 'high' : 'low',
    warnings,
    canAutoImport: !!(upstream && vhost.authType !== 'Basic'),
  }
}
