import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auditLog, dnsProviders, nanoid } from '@proxyos/db'
import type { DnsProvider, DnsProviderType } from '@proxyos/types'
import { publicProcedure, router } from '../trpc'
import { encryptJson, decryptJson } from '../crypto'

const dnsTypes = ['cloudflare', 'route53', 'porkbun', 'digitalocean', 'godaddy'] as const

function rowToProvider(row: typeof dnsProviders.$inferSelect, redacted = true): DnsProvider {
  const creds = decryptJson<Record<string, string>>(row.credentials)
  return {
    id: row.id,
    name: row.name,
    type: row.type as DnsProviderType,
    credentials: redacted ? redact(creds) : creds,
    enabled: row.enabled,
    createdAt: row.createdAt,
  }
}

function redact(c: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(c)) out[k] = c[k]!.length > 0 ? '•••' : ''
  return out
}

export const dnsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(dnsProviders)
    return rows.map((r) => rowToProvider(r, true))
  }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        type: z.enum(dnsTypes),
        credentials: z.record(z.string(), z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = nanoid()
      const now = new Date()
      await ctx.db.insert(dnsProviders).values({
        id,
        name: input.name,
        type: input.type,
        credentials: encryptJson(input.credentials),
        enabled: true,
        createdAt: now,
      })
      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'dns.create',
        resourceType: 'dns_provider',
        resourceId: id,
        resourceName: input.name,
        actor: 'user',
        detail: JSON.stringify({ type: input.type }),
        createdAt: now,
      })
      return { id }
    }),

  test: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(dnsProviders).where(eq(dnsProviders.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const creds = decryptJson<Record<string, string>>(row.credentials)
      const requiredKeys: Record<string, string[]> = {
        cloudflare: ['api_token'],
        route53: ['access_key_id', 'secret_access_key'],
        porkbun: ['api_key', 'api_secret'],
        digitalocean: ['auth_token'],
        godaddy: ['api_token', 'api_secret'],
      }
      const missing = (requiredKeys[row.type] ?? []).filter((k) => !creds[k] || creds[k]!.length === 0)
      return {
        ok: missing.length === 0,
        configured: missing.length === 0,
        missing,
        message: missing.length === 0 ? 'Credentials present (Caddy will validate at challenge time)' : `Missing: ${missing.join(', ')}`,
      }
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(dnsProviders).where(eq(dnsProviders.id, input.id)).get()
      await ctx.db.delete(dnsProviders).where(eq(dnsProviders.id, input.id))
      if (row) {
        await ctx.db.insert(auditLog).values({
          id: nanoid(),
          action: 'dns.delete',
          resourceType: 'dns_provider',
          resourceId: input.id,
          resourceName: row.name,
          actor: 'user',
          createdAt: new Date(),
        })
      }
      return { success: true }
    }),
})
