import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { ddnsRecords, dnsProviders, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'
import type { Result } from '@proxyos/types'

function toCaddyFetchError(err: Error): never {
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `[cloudflare] Failed to reach API: ${err.message}` })
}

async function detectPublicIp(): Promise<Result<string, Error>> {
  try {
    const res = await fetch('https://api4.my-ip.io/ip.json', { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { ok: false, error: new Error(`IP detection failed: ${res.status}`) }
    const data = await res.json() as { ip: string }
    return { ok: true, value: data.ip }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) }
  }
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
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `DDNS record with ID '${input.id}' not found` })
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
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `DDNS record with ID '${input.id}' not found` })

      const ipResult = await detectPublicIp()
      if (!ipResult.ok) {
        const errMsg = ipResult.error.message
        await ctx.db.update(ddnsRecords).set({ lastError: errMsg }).where(eq(ddnsRecords.id, input.id))
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `IP detection failed: ${errMsg}` })
      }

      const ip = ipResult.value

      if (ip === row.lastIp) {
        return { success: true, ip, changed: false }
      }

      // Update the DNS record via provider API
      const provider = await ctx.db.select().from(dnsProviders).where(eq(dnsProviders.id, row.dnsProviderId)).get()
      if (!provider) throw new TRPCError({ code: 'NOT_FOUND', message: 'DNS provider not found' })

      const credentials = JSON.parse(provider.credentials) as Record<string, string>
      const updateResult = provider.type === 'cloudflare'
        ? await updateCloudflare(credentials, row.zone, row.recordName, row.recordType, ip)
        : { ok: false, error: new Error(`DNS provider type '${provider.type}' not yet supported for DDNS`) } as Result<undefined, Error>

      await ctx.db.update(ddnsRecords).set({
        lastIp: updateResult.ok ? ip : row.lastIp,
        lastUpdatedAt: new Date(),
        lastError: updateResult.ok ? null : updateResult.error.message,
      }).where(eq(ddnsRecords.id, input.id))

      if (!updateResult.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: updateResult.error.message })
      return { success: true, ip, changed: true }
    }),

  detectIp: publicProcedure.query(async () => {
    const result = await detectPublicIp()
    return { ip: result.ok ? result.value : null }
  }),
})

async function updateCloudflare(
  creds: Record<string, string>,
  zone: string,
  name: string,
  type: string,
  ip: string,
): Promise<Result<undefined, Error>> {
  const token = creds.api_token ?? creds.token
  if (!token) return { ok: false, error: new Error('Missing Cloudflare api_token credential') }

  // List zone IDs
  const zonesRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${zone}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(toCaddyFetchError)
  if (!zonesRes.ok) return { ok: false, error: new Error(`Cloudflare zones API returned ${zonesRes.status}`) }
  const zonesData = await zonesRes.json() as { result?: Array<{ id: string }> }
  const zoneId = zonesData.result?.[0]?.id
  if (!zoneId) return { ok: false, error: new Error(`Zone '${zone}' not found in Cloudflare`) }

  // List existing records
  const recordsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=${type}&name=${name}.${zone}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(toCaddyFetchError)
  if (!recordsRes.ok) return { ok: false, error: new Error(`Cloudflare DNS records API returned ${recordsRes.status}`) }
  const recordsData = await recordsRes.json() as { result?: Array<{ id: string }> }
  const existingId = recordsData.result?.[0]?.id

  const body = JSON.stringify({ type, name: `${name}.${zone}`, content: ip, ttl: 1, proxied: false })
  if (existingId) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existingId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    })
    if (!r.ok) {
      const cfBody = await r.text().catch(() => '')
      return { ok: false, error: new Error(`Cloudflare update failed: ${r.status} ${cfBody}`) }
    }
  } else {
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    })
    if (!r.ok) {
      const cfBody = await r.text().catch(() => '')
      return { ok: false, error: new Error(`Cloudflare create failed: ${r.status} ${cfBody}`) }
    }
  }

  return { ok: true, value: undefined }
}
