import { getDb, staticUpstreams } from '@proxyos/db'
import type { UpstreamConfig } from '@proxyos/types'

function parseHost(address: string): { scheme: string; host: string; port: string } {
  const withScheme = address.includes('://') ? address : `http://${address}`
  try {
    const u = new URL(withScheme)
    return {
      scheme: u.protocol.replace(':', ''),
      host: u.hostname,
      port: u.port,
    }
  } catch {
    return { scheme: 'http', host: address, port: '' }
  }
}

/**
 * Resolve static upstream names to their actual hosts.
 * If an upstream address references a name that matches a static upstream entry,
 * substitute the entry's host. Port in the original URL takes precedence; falls
 * back to the entry's default_port.
 */
export async function resolveStaticUpstreams(upstreams: UpstreamConfig[]): Promise<UpstreamConfig[]> {
  const db = getDb()
  const entries = await db.select().from(staticUpstreams)
  if (entries.length === 0) return upstreams

  const byName = new Map(entries.map(e => [e.name, e]))

  return upstreams.map(u => {
    const { scheme, host, port } = parseHost(u.address)
    const entry = byName.get(host)
    if (!entry) return u

    const resolvedPort = port || (entry.defaultPort ? String(entry.defaultPort) : '')
    const resolvedScheme = scheme !== 'http' ? scheme : entry.defaultScheme
    const resolvedAddress = resolvedPort
      ? `${resolvedScheme}://${entry.host}:${resolvedPort}`
      : `${resolvedScheme}://${entry.host}`

    return { ...u, address: resolvedAddress }
  })
}

export async function getAllStaticUpstreams() {
  const db = getDb()
  return db.select().from(staticUpstreams)
}
