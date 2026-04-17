import { eq } from 'drizzle-orm'
import { ddnsRecords, dnsProviders } from '@proxyos/db'
import type { Db } from '@proxyos/db'

async function detectPublicIp(): Promise<string | null> {
  try {
    const res = await fetch('https://api4.my-ip.io/ip.json', { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json() as { ip?: string }
    return data.ip ?? null
  } catch {
    return null
  }
}

async function updateCloudflare(
  creds: Record<string, string>,
  zone: string,
  name: string,
  type: string,
  ip: string,
): Promise<void> {
  const token = creds.api_token ?? creds.token
  if (!token) throw new Error('Missing Cloudflare api_token')

  const zonesRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${zone}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const zonesData = await zonesRes.json() as { result?: Array<{ id: string }> }
  const zoneId = zonesData.result?.[0]?.id
  if (!zoneId) throw new Error(`Zone '${zone}' not found`)

  const recordsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=${type}&name=${name}.${zone}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const recordsData = await recordsRes.json() as { result?: Array<{ id: string }> }
  const existingId = recordsData.result?.[0]?.id

  const body = JSON.stringify({ type, name: `${name}.${zone}`, content: ip, ttl: 1, proxied: false })
  const method = existingId ? 'PUT' : 'POST'
  const url = existingId
    ? `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existingId}`
    : `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`

  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body,
  })
  if (!r.ok) throw new Error(`Cloudflare API error: ${r.status}`)
}

export function startDdnsUpdater(db: Db): void {
  let lastIp: string | null = null
  let lastIpCheck = 0

  const poll = async () => {
    const now = Date.now()
    if (now - lastIpCheck > 60_000) {
      lastIp = await detectPublicIp()
      lastIpCheck = now
    }
    if (!lastIp) return

    const records = await db.select().from(ddnsRecords).where(eq(ddnsRecords.enabled, true))
    for (const rec of records) {
      if (rec.lastIp === lastIp) continue

      const lastUpdate = rec.lastUpdatedAt?.getTime() ?? 0
      if (now - lastUpdate < rec.updateIntervalS * 1000) continue

      const provider = await db.select().from(dnsProviders).where(eq(dnsProviders.id, rec.dnsProviderId)).get()
      if (!provider) continue

      const credentials = JSON.parse(provider.credentials) as Record<string, string>
      let error: string | null = null

      try {
        if (provider.type === 'cloudflare') {
          await updateCloudflare(credentials, rec.zone, rec.recordName, rec.recordType, lastIp)
        } else {
          error = `Provider type '${provider.type}' not supported for DDNS`
        }
      } catch (err) {
        error = (err as Error).message
      }

      await db.update(ddnsRecords).set({
        lastIp: error ? rec.lastIp : lastIp,
        lastUpdatedAt: new Date(),
        lastError: error,
      }).where(eq(ddnsRecords.id, rec.id))
    }
  }

  poll().catch(() => {})
  setInterval(() => { poll().catch(() => {}) }, 60_000)
}
