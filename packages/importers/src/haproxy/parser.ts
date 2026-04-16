import type { ImportedRoute } from '../types'

interface HAProxyFrontend {
  name: string
  bind: string
  hostAcls: string[]
  defaultBackend?: string
  useBackend: Array<{ acl: string; backend: string }>
}

interface HAProxyBackend {
  name: string
  servers: Array<{ name: string; host: string; port: number }>
}

export function parseHAProxyConfig(content: string): { frontends: HAProxyFrontend[]; backends: HAProxyBackend[] } {
  const frontends: HAProxyFrontend[] = []
  const backends: HAProxyBackend[] = []

  // Split by section headers
  const sectionRe = /^(frontend|backend)\s+(\S+)\s*$/gm
  const sectionMatches: Array<{ type: string; name: string; index: number }> = []
  for (const sm of content.matchAll(sectionRe)) {
    sectionMatches.push({ type: sm[1] ?? '', name: sm[2] ?? '', index: sm.index ?? 0 })
  }

  for (let i = 0; i < sectionMatches.length; i++) {
    const sec = sectionMatches[i]!
    const nextIndex = sectionMatches[i + 1]?.index ?? content.length
    const body = content.slice(sec.index, nextIndex)
    if (sec.type === 'frontend') frontends.push(parseFrontend(sec.name, body))
    else if (sec.type === 'backend') backends.push(parseBackend(sec.name, body))
  }

  return { frontends, backends }
}

function parseFrontend(name: string, body: string): HAProxyFrontend {
  let bind = ''
  const hostAcls: string[] = []
  let defaultBackend: string | undefined
  const useBackend: Array<{ acl: string; backend: string }> = []

  for (const line of body.split('\n')) {
    const t = line.trim()
    if (t.startsWith('bind ')) {
      bind = t.replace('bind ', '').trim()
    } else if (t.match(/^acl\s+\S+\s+hdr\(host\)\s+-i\s+/)) {
      const hm = t.match(/^acl\s+\S+\s+hdr\(host\)\s+-i\s+(.+)$/)
      if (hm) hostAcls.push(...(hm[1] ?? '').trim().split(/\s+/))
    } else if (t.startsWith('default_backend ')) {
      defaultBackend = t.replace('default_backend ', '').trim()
    } else if (t.startsWith('use_backend ')) {
      const parts = t.replace('use_backend ', '').split(/\s+if\s+/)
      if (parts.length === 2) useBackend.push({ backend: parts[0]!.trim(), acl: parts[1]!.trim() })
    }
  }

  return { name, bind, hostAcls, defaultBackend, useBackend }
}

function parseBackend(name: string, body: string): HAProxyBackend {
  const servers: Array<{ name: string; host: string; port: number }> = []
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (t.startsWith('server ')) {
      const parts = t.split(/\s+/)
      const srvName = parts[1] ?? ''
      const addrPart = parts[2] ?? ''
      const [host, portStr] = addrPart.split(':')
      const port = parseInt(portStr ?? '80')
      if (host) servers.push({ name: srvName, host, port: isNaN(port) ? 80 : port })
    }
  }
  return { name, servers }
}

export function haproxyPairToProxyOSRoute(
  frontend: HAProxyFrontend,
  backend: HAProxyBackend,
): ImportedRoute | null {
  const domain = frontend.hostAcls[0]
  if (!domain) return null
  const server = backend.servers[0]
  if (!server) return null
  const upstream = `${server.host}:${server.port}`
  const isComplex = frontend.hostAcls.length > 1 || frontend.useBackend.length > 1

  const warnings: string[] = []
  if (isComplex) warnings.push('Complex ACL routing detected — only first host/backend mapping imported')

  return {
    domain,
    upstream,
    protocol: 'http',
    tlsDetected: false,
    suggestedTlsMode: 'auto',
    ssoDetected: false,
    basicAuthDetected: false,
    compressionDetected: false,
    websocketDetected: false,
    rateLimitDetected: false,
    sourceType: 'haproxy',
    sourceIdentifier: `frontend:${frontend.name}→backend:${backend.name}`,
    confidence: isComplex ? 'medium' : 'high',
    warnings,
    canAutoImport: !isComplex,
  }
}

export function buildHAProxyRoutes(
  frontends: HAProxyFrontend[],
  backends: HAProxyBackend[],
): ImportedRoute[] {
  const backendMap = new Map(backends.map(b => [b.name, b]))
  const routes: ImportedRoute[] = []
  for (const fe of frontends) {
    const backendName = fe.defaultBackend ?? fe.useBackend[0]?.backend
    if (!backendName) continue
    const be = backendMap.get(backendName)
    if (!be) continue
    const route = haproxyPairToProxyOSRoute(fe, be)
    if (route) routes.push(route)
  }
  return routes
}
