import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { secretsProviders, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'

function rowToProvider(row: typeof secretsProviders.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    type: row.type as 'lockboxos' | 'vault' | 'env',
    config: JSON.parse(row.config) as Record<string, string>,
    enabled: row.enabled,
    lastTestedAt: row.lastTestedAt,
    testStatus: row.testStatus as 'ok' | 'error' | 'unknown',
    createdAt: row.createdAt,
  }
}

async function testProvider(type: string, config: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  if (type === 'env') return { ok: true }
  if (type === 'vault') {
    try {
      const url = config.url
      const token = config.token
      if (!url || !token) return { ok: false, error: 'url and token required' }
      const res = await fetch(`${url}/v1/sys/health`, { headers: { 'X-Vault-Token': token! }, signal: AbortSignal.timeout(5000) })
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
  if (type === 'lockboxos') {
    try {
      const url = config.url
      const apiKey = config.apiKey
      if (!url || !apiKey) return { ok: false, error: 'url and apiKey required' }
      const res = await fetch(`${url}/api/health`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(5000) })
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
  return { ok: false, error: 'unknown provider type' }
}

export const secretsProvidersRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(secretsProviders)
    return rows.map(rowToProvider)
  }),

  create: operatorProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      type: z.enum(['lockboxos', 'vault', 'env']),
      config: z.record(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      const id = nanoid()
      await ctx.db.insert(secretsProviders).values({
        id,
        name: input.name,
        type: input.type,
        config: JSON.stringify(input.config),
        enabled: true,
        testStatus: 'unknown',
        createdAt: now,
      })
      const row = await ctx.db.select().from(secretsProviders).where(eq(secretsProviders.id, id)).get()
      return rowToProvider(row!)
    }),

  update: operatorProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(100).optional(),
      config: z.record(z.string()).optional(),
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(secretsProviders).where(eq(secretsProviders.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const patch: Record<string, unknown> = {}
      if (input.name !== undefined) patch.name = input.name
      if (input.config !== undefined) patch.config = JSON.stringify(input.config)
      if (input.enabled !== undefined) patch.enabled = input.enabled
      await ctx.db.update(secretsProviders).set(patch).where(eq(secretsProviders.id, input.id))
      const updated = await ctx.db.select().from(secretsProviders).where(eq(secretsProviders.id, input.id)).get()
      return rowToProvider(updated!)
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(secretsProviders).where(eq(secretsProviders.id, input.id))
      return { success: true }
    }),

  test: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(secretsProviders).where(eq(secretsProviders.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const config = JSON.parse(row.config) as Record<string, string>
      const result = await testProvider(row.type, config)
      await ctx.db.update(secretsProviders).set({
        testStatus: result.ok ? 'ok' : 'error',
        lastTestedAt: new Date(),
      }).where(eq(secretsProviders.id, input.id))
      return result
    }),

  resolveSecret: operatorProcedure
    .input(z.object({ providerId: z.string(), key: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(secretsProviders).where(eq(secretsProviders.id, input.providerId)).get()
      if (!row || !row.enabled) throw new TRPCError({ code: 'NOT_FOUND' })
      const config = JSON.parse(row.config) as Record<string, string>
      if (row.type === 'env') {
        const val = process.env[input.key]
        if (!val) throw new TRPCError({ code: 'NOT_FOUND', message: `Env var ${input.key} not set` })
        return { value: val }
      }
      if (row.type === 'vault') {
        const url = config.url
        const token = config.token
        const mount = config.mount ?? 'secret'
        const res = await fetch(`${url}/v1/${mount}/data/${input.key}`, {
          headers: { 'X-Vault-Token': token! },
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) throw new TRPCError({ code: 'NOT_FOUND', message: `Vault: HTTP ${res.status}` })
        const data = await res.json() as { data?: { data?: Record<string, string> } }
        const val = data?.data?.data?.[input.key] ?? data?.data?.data?.value
        if (!val) throw new TRPCError({ code: 'NOT_FOUND', message: 'Secret key not found in Vault response' })
        return { value: val }
      }
      if (row.type === 'lockboxos') {
        const url = config.url
        const apiKey = config.apiKey
        const res = await fetch(`${url}/api/secrets/${encodeURIComponent(input.key)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) throw new TRPCError({ code: 'NOT_FOUND', message: `LockBoxOS: HTTP ${res.status}` })
        const data = await res.json() as { value?: string }
        if (!data.value) throw new TRPCError({ code: 'NOT_FOUND', message: 'Secret not found' })
        return { value: data.value }
      }
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Unsupported provider type' })
    }),
})
