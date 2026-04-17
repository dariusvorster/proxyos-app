import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { discoveryProviders, discoveredRoutes, routes, nanoid, auditLog } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'

const providerConfigSchema = z.object({
  socketPath: z.string().optional(), // Docker: '/var/run/docker.sock'
  apiUrl: z.string().optional(),     // Proxmox: 'https://pve.host:8006'
  apiToken: z.string().optional(),
  labelPrefix: z.string().default('proxyos'),
})

export const discoveryRouter = router({
  listProviders: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(discoveryProviders)
    return rows.map(r => ({
      id: r.id,
      type: r.type as 'docker' | 'proxmox' | 'infraos',
      name: r.name,
      config: JSON.parse(r.config) as Record<string, unknown>,
      enabled: r.enabled,
      lastSyncAt: r.lastSyncAt,
      syncIntervalS: r.syncIntervalS,
      createdAt: r.createdAt,
    }))
  }),

  createProvider: operatorProcedure
    .input(z.object({
      type: z.enum(['docker', 'proxmox', 'infraos']),
      name: z.string().min(1).max(100),
      config: providerConfigSchema,
      syncIntervalS: z.number().int().min(10).default(60),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = nanoid()
      const now = new Date()
      await ctx.db.insert(discoveryProviders).values({
        id,
        type: input.type,
        name: input.name,
        config: JSON.stringify(input.config),
        enabled: true,
        syncIntervalS: input.syncIntervalS,
        createdAt: now,
      })
      return { id, success: true }
    }),

  updateProvider: operatorProcedure
    .input(z.object({
      id: z.string(),
      patch: z.object({
        name: z.string().min(1).max(100).optional(),
        config: providerConfigSchema.optional(),
        enabled: z.boolean().optional(),
        syncIntervalS: z.number().int().min(10).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(discoveryProviders).where(eq(discoveryProviders.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const update: Record<string, unknown> = {}
      if (input.patch.name !== undefined) update.name = input.patch.name
      if (input.patch.config !== undefined) update.config = JSON.stringify(input.patch.config)
      if (input.patch.enabled !== undefined) update.enabled = input.patch.enabled
      if (input.patch.syncIntervalS !== undefined) update.syncIntervalS = input.patch.syncIntervalS
      await ctx.db.update(discoveryProviders).set(update).where(eq(discoveryProviders.id, input.id))
      return { success: true }
    }),

  deleteProvider: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(discoveryProviders).where(eq(discoveryProviders.id, input.id))
      return { success: true }
    }),

  listDiscovered: publicProcedure
    .input(z.object({ providerId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const rows = input.providerId
        ? await ctx.db.select().from(discoveredRoutes).where(eq(discoveredRoutes.providerId, input.providerId))
        : await ctx.db.select().from(discoveredRoutes)
      return rows
    }),

  promote: operatorProcedure
    .input(z.object({
      discoveredId: z.string(),
      tlsMode: z.enum(['auto', 'dns', 'internal', 'custom', 'off']).default('auto'),
    }))
    .mutation(async ({ ctx, input }) => {
      const dr = await ctx.db.select().from(discoveredRoutes).where(eq(discoveredRoutes.id, input.discoveredId)).get()
      if (!dr) throw new TRPCError({ code: 'NOT_FOUND' })
      if (dr.promotedRouteId) throw new TRPCError({ code: 'CONFLICT', message: 'Already promoted' })

      const now = new Date()
      const routeId = nanoid()
      const upstreamAddress = dr.upstreamUrl.replace(/^https?:\/\//, '')
      await ctx.db.insert(routes).values({
        id: routeId,
        name: dr.domain,
        domain: dr.domain,
        enabled: true,
        upstreamType: 'http',
        upstreams: JSON.stringify([{ address: upstreamAddress }]),
        lbPolicy: 'round_robin',
        tlsMode: input.tlsMode,
        ssoEnabled: false,
        healthCheckEnabled: true,
        healthCheckPath: '/',
        healthCheckInterval: 30,
        compressionEnabled: true,
        websocketEnabled: true,
        http2Enabled: true,
        http3Enabled: true,
        createdAt: now,
        updatedAt: now,
      })

      await ctx.db.update(discoveredRoutes).set({ promotedRouteId: routeId }).where(eq(discoveredRoutes.id, input.discoveredId))

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'discovery.promote',
        resourceType: 'route',
        resourceId: routeId,
        resourceName: dr.domain,
        actor: 'user',
        detail: JSON.stringify({ discoveredId: input.discoveredId }),
        createdAt: now,
      })

      return { success: true, routeId }
    }),

  unlink: operatorProcedure
    .input(z.object({ discoveredId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(discoveredRoutes).set({ promotedRouteId: null }).where(eq(discoveredRoutes.id, input.discoveredId))
      return { success: true }
    }),
})
