import type { TraefikRouter, TraefikService } from './api-reader'

interface TraefikConfig {
  routers: TraefikRouter[]
  services: TraefikService[]
}

export function parseTraefikYAML(content: string): TraefikConfig {
  const routers: TraefikRouter[] = []
  const services: TraefikService[] = []

  // Match router entries that contain rule: Host(...)
  const routerRe = /(\w[\w-]*):\s*\n(?:\s+[^\n]+\n)*?\s+rule:\s*"?([^"\n]+)"?/gm
  for (const m of content.matchAll(routerRe)) {
    const name = m[1] ?? ''
    const rule = m[2] ?? ''
    if (!rule.includes('Host')) continue
    const svcMatch = content.slice(m.index ?? 0).match(/service:\s*([\w-]+)/)
    const tlsMatch = content.slice(m.index ?? 0, (m.index ?? 0) + 200).includes('tls:')
    routers.push({
      name,
      rule: rule.trim(),
      service: svcMatch?.[1] ?? name,
      tls: tlsMatch ? {} : undefined,
    })
  }

  // Match service url entries
  const svcRe = /(\w[\w-]*):\s*\n(?:\s+[^\n]+\n)*?\s+url:\s*"?([^"\n]+)"?/gm
  for (const m of content.matchAll(svcRe)) {
    services.push({
      name: m[1] ?? '',
      loadBalancer: { servers: [{ url: (m[2] ?? '').trim() }] },
    })
  }

  return { routers, services }
}

export function parseTraefikTOML(content: string): TraefikConfig {
  const routers: TraefikRouter[] = []
  const services: TraefikService[] = []

  // [http.routers.NAME] ... rule = "..."
  const routerRe = /\[http\.routers\.(\w[\w-]*)\][^\[]*rule\s*=\s*"([^"]+)"/gs
  for (const m of content.matchAll(routerRe)) {
    const name = m[1] ?? ''
    const rule = m[2] ?? ''
    const svcMatch = content.slice(m.index ?? 0, (m.index ?? 0) + 300).match(/service\s*=\s*"([\w-]+)"/)
    const tlsMatch = content.slice(m.index ?? 0, (m.index ?? 0) + 300).includes('[http.routers.' + name + '.tls]')
    routers.push({
      name,
      rule,
      service: svcMatch?.[1] ?? name,
      tls: tlsMatch ? {} : undefined,
    })
  }

  // [http.services.NAME.loadBalancer.servers] ... url = "..."
  const svcRe = /\[http\.services\.(\w[\w-]*)\.loadBalancer\.servers\][^\[]*url\s*=\s*"([^"]+)"/gs
  for (const m of content.matchAll(svcRe)) {
    services.push({
      name: m[1] ?? '',
      loadBalancer: { servers: [{ url: (m[2] ?? '').trim() }] },
    })
  }

  return { routers, services }
}

export type { TraefikConfig }
