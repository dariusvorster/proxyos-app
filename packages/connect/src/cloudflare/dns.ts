import { cfFetch } from './client'

export interface CfZoneResult {
  id: string
  name: string
  status: string
  name_servers: string[]
}

export interface CfTokenDetails {
  valid: boolean
  email?: string
  permissions: string[]
}

export async function cfVerifyTokenDetails(token: string): Promise<CfTokenDetails> {
  try {
    const result = await cfFetch<{ status: string; policies?: { id: string; effect: string; resources: Record<string, string>; permission_groups: { id: string; name: string }[] }[] }>(token, '/user/tokens/verify')
    if (result.status !== 'active') return { valid: false, permissions: [] }
    const permissions = (result.policies ?? []).flatMap(p => p.permission_groups.map(g => g.name))
    return { valid: true, permissions }
  } catch {
    return { valid: false, permissions: [] }
  }
}

export async function cfListZones(token: string): Promise<CfZoneResult[]> {
  return cfFetch<CfZoneResult[]>(token, '/zones?per_page=50&status=active')
}

export async function cfResolveZoneForDomain(token: string, domain: string): Promise<CfZoneResult | null> {
  const zones = await cfListZones(token)
  // Find the most specific zone that is a suffix of the domain
  const matches = zones.filter(z => domain === z.name || domain.endsWith(`.${z.name}`))
  if (matches.length === 0) return null
  return matches.sort((a, b) => b.name.length - a.name.length)[0] ?? null
}

export async function cfSetRecordProxied(token: string, zoneId: string, recordId: string, proxied: boolean): Promise<CfDnsRecord> {
  return cfFetch<CfDnsRecord>(token, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ proxied }),
  })
}

export interface CfDnsRecord {
  id: string
  type: string
  name: string
  content: string
  proxied: boolean
  ttl: number
  zone_id: string
}

export async function cfVerifyToken(token: string): Promise<boolean> {
  try {
    const result = await cfFetch<{ status: string }>(token, '/user/tokens/verify')
    return result.status === 'active'
  } catch {
    return false
  }
}

export async function cfListDnsRecords(token: string, zoneId: string): Promise<CfDnsRecord[]> {
  return cfFetch<CfDnsRecord[]>(token, `/zones/${zoneId}/dns_records?per_page=100`)
}

export async function cfFindDnsRecord(token: string, zoneId: string, name: string): Promise<CfDnsRecord | null> {
  const records = await cfListDnsRecords(token, zoneId)
  return records.find(r => r.name === name || r.name === `${name}.`) ?? null
}

export async function cfCreateDnsRecord(
  token: string, zoneId: string,
  name: string, type: 'A' | 'CNAME', content: string, proxied = true,
): Promise<CfDnsRecord> {
  return cfFetch<CfDnsRecord>(token, `/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({ type, name, content, proxied, ttl: 1 }),
  })
}

export async function cfUpdateDnsRecord(
  token: string, zoneId: string, recordId: string,
  content: string, proxied = true,
): Promise<CfDnsRecord> {
  return cfFetch<CfDnsRecord>(token, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content, proxied }),
  })
}

export async function cfDeleteDnsRecord(token: string, zoneId: string, recordId: string): Promise<void> {
  await cfFetch<{ id: string }>(token, `/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE' })
}

export async function cfEnsureDnsRecord(
  token: string, zoneId: string, domain: string, ip: string,
): Promise<{ record: CfDnsRecord; created: boolean }> {
  const existing = await cfFindDnsRecord(token, zoneId, domain)
  if (existing) {
    if (existing.content !== ip) {
      const updated = await cfUpdateDnsRecord(token, zoneId, existing.id, ip, existing.proxied)
      return { record: updated, created: false }
    }
    return { record: existing, created: false }
  }
  const created = await cfCreateDnsRecord(token, zoneId, domain, 'A', ip)
  return { record: created, created: true }
}
