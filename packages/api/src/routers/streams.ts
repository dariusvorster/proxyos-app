import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { streams, nanoid, auditLog, systemLog } from '@proxyos/db'
import { buildLogEntry } from './systemLog'
import { publicProcedure, router } from '../trpc'
import net from 'net'

const portSchema = z.number().int().min(1).max(65535)

const createInput = z.object({
  listenPort: portSchema,
  protocol: z.enum(['tcp', 'udp', 'tcp+udp']).default('tcp'),
  upstreamHost: z.string().min(1),
  upstreamPort: portSchema,
})

function rowToStream(row: typeof streams.$inferSelect) {
  return {
    id: row.id,
    agentId: row.agentId,
    listenPort: row.listenPort,
    protocol: row.protocol as 'tcp' | 'udp' | 'tcp+udp',
    upstreamHost: row.upstreamHost,
    upstreamPort: row.upstreamPort,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function probeTcp(host: string, port: number, timeoutMs = 3000): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = performance.now()
  return new Promise((resolve) => {
    const sock = new net.Socket()
    const done = (ok: boolean, error?: string) => {
      sock.destroy()
      resolve({ ok, latencyMs: Math.round(performance.now() - start), error })
    }
    sock.setTimeout(timeoutMs)
    sock.on('connect', () => done(true))
    sock.on('timeout', () => done(false, 'Connection timed out'))
    sock.on('error', (err) => done(false, err.message))
    sock.connect(port, host)
  })
}

export const streamsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(streams)
    return rows.map(rowToStream)
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(streams).where(eq(streams.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      return rowToStream(row)
    }),

  create: publicProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.select().from(streams).where(eq(streams.listenPort, input.listenPort)).get()
    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: `Port ${input.listenPort} is already in use by another stream` })
    }

    const now = new Date()
    const id = nanoid()

    await ctx.db.insert(streams).values({
      id,
      listenPort: input.listenPort,
      protocol: input.protocol,
      upstreamHost: input.upstreamHost,
      upstreamPort: input.upstreamPort,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })

    try {
      await ctx.caddy.addLayerFourStream({
        id,
        listenPort: input.listenPort,
        protocol: input.protocol,
        upstreamHost: input.upstreamHost,
        upstreamPort: input.upstreamPort,
      })
    } catch (err) {
      await ctx.db.insert(systemLog).values(buildLogEntry('warn', 'caddy', `Stream ${id} saved but not pushed to Caddy (layer4 module may be missing)`, {
        listenPort: input.listenPort,
        upstreamHost: input.upstreamHost,
        upstreamPort: input.upstreamPort,
        error: (err as Error).message,
      })).catch(() => {})
    }

    await ctx.db.insert(auditLog).values({
      id: nanoid(),
      action: 'stream.create',
      resourceType: 'stream',
      resourceId: id,
      resourceName: `${input.upstreamHost}:${input.upstreamPort}`,
      actor: 'user',
      detail: JSON.stringify({ listenPort: input.listenPort, protocol: input.protocol }),
      createdAt: now,
    })

    const row = await ctx.db.select().from(streams).where(eq(streams.id, id)).get()
    return rowToStream(row!)
  }),

  update: publicProcedure
    .input(z.object({
      id: z.string(),
      patch: z.object({
        listenPort: portSchema.optional(),
        protocol: z.enum(['tcp', 'udp', 'tcp+udp']).optional(),
        upstreamHost: z.string().min(1).optional(),
        upstreamPort: portSchema.optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(streams).where(eq(streams.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      if (input.patch.listenPort !== undefined && input.patch.listenPort !== row.listenPort) {
        const conflict = await ctx.db.select().from(streams).where(eq(streams.listenPort, input.patch.listenPort)).get()
        if (conflict) {
          throw new TRPCError({ code: 'CONFLICT', message: `Port ${input.patch.listenPort} is already in use by another stream` })
        }
      }

      const update: Record<string, unknown> = { updatedAt: new Date() }
      if (input.patch.listenPort !== undefined) update.listenPort = input.patch.listenPort
      if (input.patch.protocol !== undefined) update.protocol = input.patch.protocol
      if (input.patch.upstreamHost !== undefined) update.upstreamHost = input.patch.upstreamHost
      if (input.patch.upstreamPort !== undefined) update.upstreamPort = input.patch.upstreamPort

      await ctx.db.update(streams).set(update).where(eq(streams.id, input.id))

      const updated = await ctx.db.select().from(streams).where(eq(streams.id, input.id)).get()
      const stream = rowToStream(updated!)

      try {
        await ctx.caddy.addLayerFourStream({
          id: stream.id,
          listenPort: stream.listenPort,
          protocol: stream.protocol,
          upstreamHost: stream.upstreamHost,
          upstreamPort: stream.upstreamPort,
        })
      } catch (err) {
        await ctx.db.insert(systemLog).values(buildLogEntry('warn', 'caddy', `Stream ${input.id} updated in DB but Caddy push failed`, {
          patch: input.patch,
          error: (err as Error).message,
        })).catch(() => {})
      }

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'stream.update',
        resourceType: 'stream',
        resourceId: input.id,
        resourceName: `${stream.upstreamHost}:${stream.upstreamPort}`,
        actor: 'user',
        detail: JSON.stringify(input.patch),
        createdAt: new Date(),
      })

      return stream
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(streams).where(eq(streams.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      try {
        await ctx.caddy.removeLayerFourStream(input.id)
      } catch (err) {
        await ctx.db.insert(systemLog).values(buildLogEntry('warn', 'caddy', `Failed to remove stream ${input.id} from Caddy`, {
          error: (err as Error).message,
        })).catch(() => {})
      }

      await ctx.db.delete(streams).where(eq(streams.id, input.id))

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'stream.delete',
        resourceType: 'stream',
        resourceId: input.id,
        resourceName: `${row.upstreamHost}:${row.upstreamPort}`,
        actor: 'user',
        createdAt: new Date(),
      })

      return { success: true }
    }),

  toggle: publicProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(streams).where(eq(streams.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.db.update(streams).set({ enabled: input.enabled, updatedAt: new Date() }).where(eq(streams.id, input.id))

      try {
        if (input.enabled) {
          await ctx.caddy.addLayerFourStream({
            id: row.id,
            listenPort: row.listenPort,
            protocol: row.protocol,
            upstreamHost: row.upstreamHost,
            upstreamPort: row.upstreamPort,
          })
        } else {
          await ctx.caddy.removeLayerFourStream(input.id)
        }
      } catch (err) {
        await ctx.db.insert(systemLog).values(buildLogEntry('warn', 'caddy', `Stream ${input.id} toggle Caddy sync failed`, {
          enabled: input.enabled,
          error: (err as Error).message,
        })).catch(() => {})
      }

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: input.enabled ? 'stream.enable' : 'stream.disable',
        resourceType: 'stream',
        resourceId: input.id,
        resourceName: `${row.upstreamHost}:${row.upstreamPort}`,
        actor: 'user',
        createdAt: new Date(),
      })

      return { success: true }
    }),

  checkUpstream: publicProcedure
    .input(z.object({ host: z.string().min(1), port: portSchema }))
    .mutation(async ({ input }) => {
      const result = await probeTcp(input.host, input.port, 3000)
      return result
    }),
})
