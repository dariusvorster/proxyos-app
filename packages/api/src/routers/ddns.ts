import { TRPCError } from '@trpc/server'
import { createHash, createHmac } from 'crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { ddnsRecords, dnsProviders, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'

async function detectPublicIp(): Promise<string> {
  const res = await fetch('https://api4.my-ip.io/ip.json', { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`IP detection failed: ${res.status}`)
  const data = await res.json() as { ip: string }
  return data.ip
}

export const ddnsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(ddnsRecords)
    return rows
  }),

  create: operatorProcedure
    .input(z.object({
      dnsProviderId: z.string(),
      zone: z.string().min(1),
      recordName: z.string().min(1),
      recordType: z.enum(['A', 'AAAA']).default('A'),
      updateIntervalS: z.number().int().min(60).max(86400).default(300),
    }))
    .mutation(async ({ ctx, input }) => {
      const provider = await ctx.db.select().from(dnsProviders).where(eq(dnsProviders.id, input.dnsProviderId)).get()
      if (!provider) throw new TRPCError({ code: 'NOT_FOUND', message: 'DNS provider not found' })

      const id = nanoid()
      await ctx.db.insert(ddnsRecords).values({
        id,
        dnsProviderId: input.dnsProviderId,
        zone: input.zone,
        recordName: input.recordName,
        recordType: input.recordType,
        updateIntervalS: input.updateIntervalS,
        enabled: true,
        createdAt: new Date(),
      })
      return { id, success: true }
    }),

  update: operatorProcedure
    .input(z.object({
      id: z.string(),
      patch: z.object({
        zone: z.string().min(1).optional(),
        recordName: z.string().min(1).optional(),
        recordType: z.enum(['A', 'AAAA']).optional(),
        updateIntervalS: z.number().int().min(60).optional(),
        enabled: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(ddnsRecords).where(eq(ddnsRecords.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const update: Record<string, unknown> = {}
      const p = input.patch
      if (p.zone !== undefined) update.zone = p.zone
      if (p.recordName !== undefined) update.recordName = p.recordName
      if (p.recordType !== undefined) update.recordType = p.recordType
      if (p.updateIntervalS !== undefined) update.updateIntervalS = p.updateIntervalS
      if (p.enabled !== undefined) update.enabled = p.enabled
      await ctx.db.update(ddnsRecords).set(update).where(eq(ddnsRecords.id, input.id))
      return { success: true }
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(ddnsRecords).where(eq(ddnsRecords.id, input.id))
      return { success: true }
    }),

  triggerUpdate: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(ddnsRecords).where(eq(ddnsRecords.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      let ip: string
      try {
        ip = await detectPublicIp()
      } catch (err) {
        await ctx.db.update(ddnsRecords).set({ lastError: (err as Error).message }).where(eq(ddnsRecords.id, input.id))
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `IP detection failed: ${(err as Error).message}` })
      }

      if (ip === row.lastIp) {
        return { success: true, ip, changed: false }
      }

      // Update the DNS record via provider API
      const provider = await ctx.db.select().from(dnsProviders).where(eq(dnsProviders.id, row.dnsProviderId)).get()
      if (!provider) throw new TRPCError({ code: 'NOT_FOUND', message: 'DNS provider not found' })

      const credentials = JSON.parse(provider.credentials) as Record<string, string>
      let updateError: string | null = null

      if (provider.type === 'cloudflare') {
        updateError = await updateCloudflare(credentials, row.zone, row.recordName, row.recordType, ip)
      } else if (provider.type === 'route53') {
        updateError = await updateRoute53(credentials, row.zone, row.recordName, row.recordType, ip)
      } else if (provider.type === 'porkbun') {
        updateError = await updatePorkbun(credentials, row.zone, row.recordName, row.recordType, ip)
      } else if (provider.type === 'digitalocean') {
        updateError = await updateDigitalOcean(credentials, row.zone, row.recordName, row.recordType, ip)
      } else if (provider.type === 'godaddy') {
        updateError = await updateGoDaddy(credentials, row.zone, row.recordName, row.recordType, ip)
      } else {
        updateError = `DNS provider type '${provider.type}' not yet supported for DDNS`
      }

      await ctx.db.update(ddnsRecords).set({
        lastIp: updateError ? row.lastIp : ip,
        lastUpdatedAt: new Date(),
        lastError: updateError,
      }).where(eq(ddnsRecords.id, input.id))

      if (updateError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: updateError })
      return { success: true, ip, changed: true }
    }),

  detectIp: publicProcedure.query(async () => {
    try {
      const ip = await detectPublicIp()
      return { ip }
    } catch {
      return { ip: null }
    }
  }),
})

async function updateCloudflare(
  creds: Record<string, string>,
  zone: string,
  name: string,
  type: string,
  ip: string,
): Promise<string | null> {
  const token = creds.api_token ?? creds.token
  if (!token) return 'Missing Cloudflare api_token credential'

  // List zone IDs
  const zonesRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${zone}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const zonesData = await zonesRes.json() as { result?: Array<{ id: string }> }
  const zoneId = zonesData.result?.[0]?.id
  if (!zoneId) return `Zone '${zone}' not found in Cloudflare`

  // List existing records
  const recordsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=${type}&name=${name}.${zone}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const recordsData = await recordsRes.json() as { result?: Array<{ id: string }> }
  const existingId = recordsData.result?.[0]?.id

  const body = JSON.stringify({ type, name: `${name}.${zone}`, content: ip, ttl: 1, proxied: false })
  if (existingId) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existingId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    })
    if (!r.ok) return `Cloudflare update failed: ${r.status}`
  } else {
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    })
    if (!r.ok) return `Cloudflare create failed: ${r.status}`
  }

  return null
}

// ── Route53 (AWS SigV4) ───────────────────────────────────────────────────────
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}
function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex')
}
function signingKey(secret: string, date: string, region: string, service: string): Buffer {
  return hmac(hmac(hmac(hmac('AWS4' + secret, date), region), service), 'aws4_request')
}

async function updateRoute53(
  creds: Record<string, string>,
  zone: string,
  name: string,
  type: string,
  ip: string,
): Promise<string | null> {
  const accessKey = creds.access_key_id
  const secretKey = creds.secret_access_key
  const hostedZoneId = creds.hosted_zone_id
  if (!accessKey || !secretKey || !hostedZoneId) return 'Missing Route53 credentials (access_key_id, secret_access_key, hosted_zone_id)'

  const region = 'us-east-1'
  const service = 'route53'
  const host = 'route53.amazonaws.com'
  const path = `/2013-04-01/hostedzone/${hostedZoneId}/rrset`
  const body = `<?xml version="1.0" encoding="UTF-8"?><ChangeResourceRecordSetsRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/"><ChangeBatch><Changes><Change><Action>UPSERT</Action><ResourceRecordSet><Name>${name}.${zone}</Name><Type>${type}</Type><TTL>60</TTL><ResourceRecords><ResourceRecord><Value>${ip}</Value></ResourceRecord></ResourceRecords></ResourceRecordSet></Change></Changes></ChangeBatch></ChangeResourceRecordSetsRequest>`
  const bodyHash = sha256Hex(body)

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const dateStamp = amzDate.slice(0, 8)

  const canonicalHeaders = `content-type:application/xml\nhost:${host}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'content-type;host;x-amz-date'
  const canonicalRequest = `POST\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${bodyHash}`
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`
  const signature = hmac(signingKey(secretKey, dateStamp, region, service), stringToSign).toString('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  try {
    const res = await fetch(`https://${host}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', 'X-Amz-Date': amzDate, Authorization: authorization },
      body,
    })
    if (!res.ok) return `Route53 update failed: ${res.status} ${await res.text()}`
    return null
  } catch (err) {
    return `Route53 update error: ${(err as Error).message}`
  }
}

// ── Porkbun ───────────────────────────────────────────────────────────────────
async function updatePorkbun(
  creds: Record<string, string>,
  zone: string,
  name: string,
  type: string,
  ip: string,
): Promise<string | null> {
  const apiKey = creds.api_key
  const secretApiKey = creds.secret_api_key
  if (!apiKey || !secretApiKey) return 'Missing Porkbun credentials (api_key, secret_api_key)'
  const auth = { apikey: apiKey, secretapikey: secretApiKey }
  try {
    // Retrieve existing records to find the record ID
    const listRes = await fetch(`https://porkbun.com/api/json/v3/dns/retrieveByNameType/${zone}/${type}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auth),
    })
    const listData = await listRes.json() as { status: string; records?: Array<{ id: string }> }
    if (listData.status !== 'SUCCESS') return `Porkbun list failed: ${listData.status}`
    const recordId = listData.records?.[0]?.id

    if (recordId) {
      const r = await fetch(`https://porkbun.com/api/json/v3/dns/edit/${zone}/${recordId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...auth, name, type, content: ip, ttl: '300' }),
      })
      const d = await r.json() as { status: string }
      if (d.status !== 'SUCCESS') return `Porkbun update failed: ${d.status}`
    } else {
      const r = await fetch(`https://porkbun.com/api/json/v3/dns/create/${zone}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...auth, name, type, content: ip, ttl: '300' }),
      })
      const d = await r.json() as { status: string }
      if (d.status !== 'SUCCESS') return `Porkbun create failed: ${d.status}`
    }
    return null
  } catch (err) {
    return `Porkbun error: ${(err as Error).message}`
  }
}

// ── DigitalOcean ──────────────────────────────────────────────────────────────
async function updateDigitalOcean(
  creds: Record<string, string>,
  zone: string,
  name: string,
  type: string,
  ip: string,
): Promise<string | null> {
  const token = creds.token
  if (!token) return 'Missing DigitalOcean credential (token)'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  try {
    const listRes = await fetch(`https://api.digitalocean.com/v2/domains/${zone}/records?type=${type}&name=${name}.${zone}`, { headers })
    const listData = await listRes.json() as { domain_records?: Array<{ id: number }> }
    const recordId = listData.domain_records?.[0]?.id
    const body = JSON.stringify({ type, name, data: ip, ttl: 300 })
    if (recordId) {
      const r = await fetch(`https://api.digitalocean.com/v2/domains/${zone}/records/${recordId}`, { method: 'PUT', headers, body })
      if (!r.ok) return `DigitalOcean update failed: ${r.status}`
    } else {
      const r = await fetch(`https://api.digitalocean.com/v2/domains/${zone}/records`, { method: 'POST', headers, body })
      if (!r.ok) return `DigitalOcean create failed: ${r.status}`
    }
    return null
  } catch (err) {
    return `DigitalOcean error: ${(err as Error).message}`
  }
}

// ── GoDaddy ───────────────────────────────────────────────────────────────────
async function updateGoDaddy(
  creds: Record<string, string>,
  zone: string,
  name: string,
  type: string,
  ip: string,
): Promise<string | null> {
  const apiKey = creds.api_key
  const apiSecret = creds.api_secret
  if (!apiKey || !apiSecret) return 'Missing GoDaddy credentials (api_key, api_secret)'
  try {
    const res = await fetch(`https://api.godaddy.com/v1/domains/${zone}/records/${type}/${name}`, {
      method: 'PUT',
      headers: { Authorization: `sso-key ${apiKey}:${apiSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ data: ip, ttl: 600 }]),
    })
    if (!res.ok) return `GoDaddy update failed: ${res.status} ${await res.text()}`
    return null
  } catch (err) {
    return `GoDaddy error: ${(err as Error).message}`
  }
}
