import { TRPCError } from '@trpc/server'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { connections, connectionSyncLog, dnsRecordsShadow, nanoid } from '@proxyos/db'
import { encryptCredentials, decryptCredentials, adapterRegistry } from '@proxyos/connect'
import { CloudflareAdapter } from '@proxyos/connect/cloudflare'
import type { CloudflareCreds } from '@proxyos/connect/cloudflare'
import { UptimeKumaAdapter, BetterstackAdapter, FreshpingAdapter } from '@proxyos/connect/monitoring'
import type { UptimeKumaCreds, BetterstackCreds, FreshpingCreds } from '@proxyos/connect/monitoring'
import { ZulipAdapter, SlackAdapter, WebhookAdapter } from '@proxyos/connect/notifications'
import type { ZulipCreds, SlackCreds, WebhookCreds } from '@proxyos/connect/notifications'
import { publicProcedure, operatorProcedure, router } from '../trpc'

export const connectionsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(connections).all()
    // Never return credentials
    return rows.map(({ credentials: _creds, ...rest }) => rest)
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(connections).where(eq(connections.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const { credentials: _creds, ...rest } = row
      return rest
    }),

  create: operatorProcedure
    .input(z.object({
      type: z.string(),
      name: z.string().min(1),
      credentials: z.record(z.unknown()),   // plain JSON — encrypted at rest
      config: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = nanoid()
      const encrypted = encryptCredentials(JSON.stringify(input.credentials))
      await ctx.db.insert(connections).values({
        id,
        type: input.type,
        name: input.name,
        credentials: encrypted,
        status: 'disconnected',
        lastSync: null,
        lastError: null,
        config: input.config ? JSON.stringify(input.config) : null,
        createdAt: new Date(),
      })

      // Register adapter immediately
      if (input.type === 'cloudflare') {
        adapterRegistry.register(new CloudflareAdapter(id, input.credentials as unknown as CloudflareCreds))
      } else if (input.type === 'uptime_kuma') {
        adapterRegistry.register(new UptimeKumaAdapter(id, input.credentials as unknown as UptimeKumaCreds))
      } else if (input.type === 'betterstack') {
        adapterRegistry.register(new BetterstackAdapter(id, input.credentials as unknown as BetterstackCreds))
      } else if (input.type === 'freshping') {
        adapterRegistry.register(new FreshpingAdapter(id, input.credentials as unknown as FreshpingCreds))
      } else if (input.type === 'zulip') {
        const a = new ZulipAdapter(id, input.credentials as unknown as ZulipCreds)
        a.subscribeToEventBus()
        adapterRegistry.register(a)
      } else if (input.type === 'slack') {
        const a = new SlackAdapter(id, input.credentials as unknown as SlackCreds)
        a.subscribeToEventBus()
        adapterRegistry.register(a)
      } else if (input.type === 'webhook') {
        const a = new WebhookAdapter(id, input.credentials as unknown as WebhookCreds)
        a.subscribeToEventBus()
        adapterRegistry.register(a)
      }

      return { id }
    }),

  updateCredentials: operatorProcedure
    .input(z.object({
      id: z.string(),
      credentials: z.record(z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(connections).where(eq(connections.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const encrypted = encryptCredentials(JSON.stringify(input.credentials))
      await ctx.db.update(connections)
        .set({ credentials: encrypted, status: 'disconnected', lastError: null })
        .where(eq(connections.id, input.id))
      return { ok: true }
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(connections).where(eq(connections.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      adapterRegistry.deregister(input.id)
      await ctx.db.delete(connections).where(eq(connections.id, input.id))
      return { ok: true }
    }),

  test: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(connections).where(eq(connections.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      const adapter = adapterRegistry.get(input.id)
      if (!adapter) {
        return { ok: false, latencyMs: 0, error: 'No adapter loaded — save credentials and reload' }
      }

      const result = await adapter.test()
      await ctx.db.update(connections)
        .set({
          status: result.ok ? 'connected' : 'error',
          lastError: result.error ?? null,
        })
        .where(eq(connections.id, input.id))
      return result
    }),

  sync: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(connections).where(eq(connections.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      const adapter = adapterRegistry.get(input.id)
      if (!adapter) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No adapter loaded' })
      }

      const start = Date.now()
      const logId = nanoid()
      try {
        await adapter.sync()

        // Cloudflare: sync DNS records to shadow table
        if (adapter.type === 'cloudflare') {
          const cfAdapter = adapter as CloudflareAdapter
          const records = await cfAdapter.getDnsRecords()
          const now = new Date()
          for (const r of records) {
            await ctx.db.insert(dnsRecordsShadow).values({
              id: r.id,
              connectionId: input.id,
              zoneId: r.zone_id,
              name: r.name,
              type: r.type,
              value: r.content,
              proxied: r.proxied ? 1 : 0,
              ttl: r.ttl,
              routeId: null,
              syncedAt: now,
            }).onConflictDoUpdate({
              target: dnsRecordsShadow.id,
              set: { name: r.name, type: r.type, value: r.content, proxied: r.proxied ? 1 : 0, ttl: r.ttl, syncedAt: now },
            })
          }
        }

        const duration = Date.now() - start
        await ctx.db.update(connections)
          .set({ status: 'connected', lastSync: new Date(), lastError: null })
          .where(eq(connections.id, input.id))
        await ctx.db.insert(connectionSyncLog).values({
          id: logId,
          connectionId: input.id,
          timestamp: new Date(),
          result: 'success',
          message: 'Sync completed',
          durationMs: duration,
        })
        return { ok: true, durationMs: duration }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await ctx.db.update(connections)
          .set({ status: 'error', lastError: msg })
          .where(eq(connections.id, input.id))
        await ctx.db.insert(connectionSyncLog).values({
          id: logId,
          connectionId: input.id,
          timestamp: new Date(),
          result: 'error',
          message: msg,
          durationMs: Date.now() - start,
        })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg })
      }
    }),

  getSyncLog: publicProcedure
    .input(z.object({ id: z.string(), limit: z.number().int().min(1).max(100).optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select()
        .from(connectionSyncLog)
        .where(eq(connectionSyncLog.connectionId, input.id))
        .orderBy(desc(connectionSyncLog.timestamp))
        .limit(input.limit ?? 20)
        .all()
      return rows
    }),

  // Decrypt credentials for server-side use only (not exposed to client via this procedure)
  _getDecryptedCredentials: operatorProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(connections).where(eq(connections.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      return JSON.parse(decryptCredentials(row.credentials)) as Record<string, unknown>
    }),
})
