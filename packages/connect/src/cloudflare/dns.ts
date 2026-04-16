import { cfFetch } from './client'

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
