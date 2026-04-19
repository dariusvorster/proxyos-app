import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { scannedContainers, routes, nanoid } from '@proxyos/db'
import { DockerScanner } from '@proxyos/scanner'
import { publicProcedure, router } from '../trpc'

// In-memory last scan cache per agentId (or 'local')
const scanCache = new Map<string, {
  scannedAt: Date
  results: Awaited<ReturnType<DockerScanner['scanRaw']>>
}>()

// In-memory auto-watch config per agentId (or 'local')
const autoWatchConfig = new Map<string, { enabled: boolean; mode: 'notify' | 'auto_labels' | 'auto_all' }>()

export const scannerRouter = router({
  scan: publicProcedure
    .input(z.object({
      agentId: z.string().optional(),
      dockerApiUrl: z.string().optional(),
      baseDomainsHint: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const cacheKey = input.agentId ?? 'local'

      // Get existing domains to mark already-configured containers
      const existingDomains = (await ctx.db.select({ domain: routes.domain }).from(routes).all())
        .map(r => r.domain)

      const scanner = new DockerScanner(
        {
          apiUrl: input.dockerApiUrl,
          agentId: input.agentId,
          baseDomainsHint: input.baseDomainsHint,
        },
        existingDomains,
      )

      const results = await scanner.scanRaw()
      scanCache.set(cacheKey, { scannedAt: new Date(), results })

      // Upsert scanned_containers records
      const now = new Date()
      for (const container of results) {
        await ctx.db.insert(scannedContainers).values({
          id: container.id,
          agentId: input.agentId ?? null,
          name: container.name,
          image: container.image,
          lastSeen: now,
          routeId: null,
          strategy: container.detectedRoutes[0]?.strategy ?? null,
          confidence: container.detectedRoutes[0]?.confidence ?? null,
        }).onConflictDoUpdate({
          target: scannedContainers.id,
          set: { name: container.name, image: container.image, lastSeen: now,
                 strategy: container.detectedRoutes[0]?.strategy ?? null,
                 confidence: container.detectedRoutes[0]?.confidence ?? null },
        })
      }

      return {
        scannedAt: now,
        containerCount: results.length,
        newSuggestions: results.filter(c => c.detectedRoutes.some(r => !r.alreadyConfigured)).length,
        results,
      }
    }),

  getResults: publicProcedure
    .input(z.object({ agentId: z.string().optional() }))
    .query(({ input }) => {
      const cacheKey = input.agentId ?? 'local'
      const cached = scanCache.get(cacheKey)
      if (!cached) return null
      return cached
    }),

  exposeContainer: publicProcedure
    .input(z.object({
      containerId: z.string(),
      agentId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const cacheKey = input.agentId ?? 'local'
      const cached = scanCache.get(cacheKey)
      const container = cached?.results.find(c => c.id === input.containerId)
      if (!container) throw new TRPCError({ code: 'NOT_FOUND', message: 'Container not found in last scan' })

      const detected = container.detectedRoutes.find(r => r.confidence === 'high' && !r.alreadyConfigured)
      if (!detected) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No high-confidence route to auto-expose' })

      const id = nanoid()
      await ctx.db.insert(routes).values({
        id,
        name: detected.suggestedDomain,
        domain: detected.suggestedDomain,
        enabled: true,
        upstreamType: 'http',
        upstreams: JSON.stringify([{ address: detected.suggestedUpstream }]),
        tlsMode: detected.tlsMode,
        ssoEnabled: detected.ssoEnabled,
        ssoProviderId: null,
        tlsDnsProviderId: null,
        compressionEnabled: true,
        websocketEnabled: false,
        healthCheckEnabled: true,
        healthCheckPath: '/',
        healthCheckInterval: 30,
        http2Enabled: true,
        http3Enabled: true,
        rateLimit: null,
        ipAllowlist: null,
        basicAuth: null,
        headers: null,
        agentId: input.agentId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      // Link container to route
      await ctx.db.update(scannedContainers)
        .set({ routeId: id })
        .where(eq(scannedContainers.id, input.containerId))

      return { routeId: id, domain: detected.suggestedDomain }
    }),

  dismissContainer: publicProcedure
    .input(z.object({ containerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(scannedContainers)
        .set({ confidence: 'dismissed' })
        .where(eq(scannedContainers.id, input.containerId))
      return { ok: true }
    }),

  setAutoWatch: publicProcedure
    .input(z.object({
      agentId: z.string().optional(),
      enabled: z.boolean(),
      mode: z.enum(['notify', 'auto_labels', 'auto_all']),
    }))
    .mutation(({ input }) => {
      const key = input.agentId ?? 'local'
      autoWatchConfig.set(key, { enabled: input.enabled, mode: input.mode })
      return { ok: true }
    }),

  getAutoWatch: publicProcedure
    .input(z.object({ agentId: z.string().optional() }))
    .query(({ input }) => {
      const key = input.agentId ?? 'local'
      return autoWatchConfig.get(key) ?? { enabled: false, mode: 'notify' as const }
    }),
})
