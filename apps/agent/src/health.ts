import type { MsgHealthReport } from '@proxyos/federation'

const CADDY_ADMIN = process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019'

interface CaddyUpstreamStatus {
  address: string
  num_requests: number
  fails: number
  available: boolean
}

export async function buildHealthReport(agentId: string): Promise<MsgHealthReport> {
  const upstreams: MsgHealthReport['upstreams'] = {}
  const certs: MsgHealthReport['certs'] = {}

  try {
    const res = await fetch(`${CADDY_ADMIN}/reverse_proxy/upstreams`)
    if (res.ok) {
      const data = await res.json() as CaddyUpstreamStatus[]
      for (const u of data) {
        upstreams[u.address] = u.available
          ? 'healthy'
          : u.fails > 3 ? 'down' : 'degraded'
      }
    }
  } catch { /* caddy may not support this endpoint */ }

  try {
    const res = await fetch(`${CADDY_ADMIN}/pki/ca/local`)
    if (res.ok) {
      const data = await res.json() as { certificates?: Array<{ not_after: string; subject: string }> }
      for (const cert of data.certificates ?? []) {
        const expiryMs = new Date(cert.not_after).getTime() - Date.now()
        certs[cert.subject] = {
          expiryDays: Math.floor(expiryMs / (1000 * 60 * 60 * 24)),
          issuer: 'Caddy Internal CA',
        }
      }
    }
  } catch { /* no PKI endpoint */ }

  return { type: 'health.report', agentId, upstreams, certs }
}
