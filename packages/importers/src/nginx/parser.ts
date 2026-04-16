import type { ImportedRoute } from '../types'

interface NginxLocation {
  path: string
  proxyPass?: string
  authRequest?: string
  proxySetHeaders: string[]
}

interface NginxServerBlock {
  serverNames: string[]
  listen: number[]
  ssl: boolean
  proxyPass?: string
  authBasic?: string
  authRequest?: string
  locations: NginxLocation[]
}

export function parseNginxConfig(content: string): NginxServerBlock[] {
  const blocks: NginxServerBlock[] = []
  // Pull out top-level server blocks
  const serverRe = /server\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gs
  for (const match of content.matchAll(serverRe)) {
    const body = match[1] ?? ''
    const block = parseServerBlock(body)
    if (block) blocks.push(block)
  }
  return blocks
}

function parseServerBlock(body: string): NginxServerBlock | null {
  const listen: number[] = []
  const serverNames: string[] = []
  let ssl = false
  let proxyPass: string | undefined
  let authBasic: string | undefined
  let authRequest: string | undefined
  const locations: NginxLocation[] = []

  for (const line of body.split('\n')) {
    const t = line.trim()
    if (t.startsWith('listen ')) {
      const port = parseInt(t.replace('listen ', ''))
      if (!isNaN(port)) listen.push(port)
      if (t.includes('ssl')) ssl = true
    } else if (t.startsWith('server_name ')) {
      serverNames.push(...t.replace('server_name ', '').replace(';', '').split(/\s+/).filter(Boolean))
    } else if (t.startsWith('ssl_certificate ') || t.startsWith('ssl on')) {
      ssl = true
    } else if (t.startsWith('proxy_pass ')) {
      proxyPass = t.replace('proxy_pass ', '').replace(';', '').trim()
    } else if (t.startsWith('auth_basic ') && !t.includes('off')) {
      authBasic = t.replace('auth_basic ', '').replace(';', '').trim().replace(/^["']|["']$/g, '')
    } else if (t.startsWith('auth_request ')) {
      authRequest = t.replace('auth_request ', '').replace(';', '').trim()
    }
  }

  // Parse location blocks
  for (const lm of body.matchAll(/location\s+([^\s{]+)\s*\{([^}]*)\}/gs)) {
    const locBody = lm[2] ?? ''
    const loc: NginxLocation = { path: lm[1] ?? '/', proxySetHeaders: [] }
    for (const line of locBody.split('\n')) {
      const lt = line.trim()
      if (lt.startsWith('proxy_pass ')) loc.proxyPass = lt.replace('proxy_pass ', '').replace(';', '').trim()
      if (lt.startsWith('auth_request ')) loc.authRequest = lt.replace('auth_request ', '').replace(';', '').trim()
      if (lt.startsWith('proxy_set_header ')) loc.proxySetHeaders.push(lt)
    }
    locations.push(loc)
  }

  if (serverNames.length === 0) return null
  return { serverNames, listen, ssl, proxyPass, authBasic, authRequest, locations }
}

function extractUpstreamFromProxyPass(proxyPass: string): string {
  try {
    const url = new URL(proxyPass)
    return `${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)}`
  } catch {
    return proxyPass.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}

function detectSSOProvider(url: string): string {
  if (url.includes('authentik')) return 'authentik'
  if (url.includes('authelia')) return 'authelia'
  if (url.includes('keycloak')) return 'keycloak'
  if (url.includes('zitadel')) return 'zitadel'
  return 'unknown'
}

export function nginxBlockToProxyOSRoute(block: NginxServerBlock): ImportedRoute {
  const domain = block.serverNames[0] ?? 'unknown'
  const rawProxy = block.proxyPass ?? block.locations.find(l => l.proxyPass)?.proxyPass ?? ''
  const upstream = rawProxy ? extractUpstreamFromProxyPass(rawProxy) : ''
  const authReqUrl = block.authRequest ?? block.locations.find(l => l.authRequest)?.authRequest

  const warnings: string[] = []
  if (!upstream) warnings.push('No proxy_pass found — upstream must be set manually')
  if (block.authBasic) warnings.push(`Basic auth detected ("${block.authBasic}") — not auto-imported`)
  if (block.serverNames.length > 1) warnings.push(`Multiple server_names — only first used: ${block.serverNames[0]}`)

  return {
    domain,
    upstream,
    protocol: block.ssl ? 'https' : 'http',
    tlsDetected: block.ssl,
    suggestedTlsMode: block.ssl ? 'auto' : 'off',
    ssoDetected: !!authReqUrl,
    ssoProvider: authReqUrl ? detectSSOProvider(authReqUrl) : undefined,
    ssoUrl: authReqUrl,
    basicAuthDetected: !!block.authBasic,
    compressionDetected: false,
    websocketDetected: block.locations.some(l => l.proxySetHeaders.some(h => h.includes('Upgrade'))),
    rateLimitDetected: false,
    sourceType: 'nginx',
    sourceIdentifier: `server_name ${domain}`,
    confidence: upstream ? 'high' : 'low',
    warnings,
    canAutoImport: !!(upstream && !block.authBasic),
  }
}
