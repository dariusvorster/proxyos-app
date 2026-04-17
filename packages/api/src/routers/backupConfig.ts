import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { routes, ssoProviders, dnsProviders, apiKeys, alertRules, routeTemplates, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'
import { eq } from 'drizzle-orm'

const EXPORT_VERSION = 1

export const backupConfigRouter = router({
  export: publicProcedure.query(async ({ ctx }) => {
    const [allRoutes, allSso, allDns, allKeys, allAlerts, allTemplates] = await Promise.all([
      ctx.db.select().from(routes).all(),
      ctx.db.select().from(ssoProviders).all(),
      ctx.db.select().from(dnsProviders).all(),
      ctx.db.select().from(apiKeys).all(),
      ctx.db.select().from(alertRules).all(),
      ctx.db.select().from(routeTemplates).all(),
    ])

    return {
      proxyos_export_version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      routes: allRoutes.map(r => ({
        id: r.id,
        name: r.name,
        domain: r.domain,
        enabled: r.enabled,
        upstreamType: r.upstreamType,
        upstreams: JSON.parse(r.upstreams),
        lbPolicy: r.lbPolicy,
        tlsMode: r.tlsMode,
        tlsDnsProviderId: r.tlsDnsProviderId,
        ssoEnabled: r.ssoEnabled,
        ssoProviderId: r.ssoProviderId,
        rateLimit: r.rateLimit ? JSON.parse(r.rateLimit) : null,
        ipAllowlist: r.ipAllowlist ? JSON.parse(r.ipAllowlist) : null,
        basicAuth: r.basicAuth ? JSON.parse(r.basicAuth) : null,
        headers: r.headers ? JSON.parse(r.headers) : null,
        healthCheckEnabled: r.healthCheckEnabled,
        healthCheckPath: r.healthCheckPath,
        healthCheckInterval: r.healthCheckInterval,
        compressionEnabled: r.compressionEnabled,
        websocketEnabled: r.websocketEnabled,
        http2Enabled: r.http2Enabled,
        http3Enabled: r.http3Enabled,
        wafMode: r.wafMode,
        wafExclusions: r.wafExclusions ? JSON.parse(r.wafExclusions) : null,
        tunnelProviderId: r.tunnelProviderId,
        oauthProxyProviderId: r.oauthProxyProviderId,
        oauthProxyAllowlist: r.oauthProxyAllowlist ? JSON.parse(r.oauthProxyAllowlist) : null,
        stagingUpstreams: r.stagingUpstreams ? JSON.parse(r.stagingUpstreams) : null,
        trafficSplitPct: r.trafficSplitPct,
        mirrorUpstream: r.mirrorUpstream,
        mirrorSampleRate: r.mirrorSampleRate,
        accessosGroups: (r as Record<string, unknown>).accessosGroups
          ? JSON.parse((r as Record<string, unknown>).accessosGroups as string) : null,
        accessosProviderId: (r as Record<string, unknown>).accessosProviderId ?? null,
        mxwatchDomain: (r as Record<string, unknown>).mxwatchDomain ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      ssoProviders: allSso.map(p => ({
        id: p.id, name: p.name, type: p.type,
        forwardAuthUrl: p.forwardAuthUrl,
        authResponseHeaders: JSON.parse(p.authResponseHeaders),
        trustedIPs: JSON.parse(p.trustedIPs),
        enabled: p.enabled, createdAt: p.createdAt,
      })),
      dnsProviders: allDns.map(p => ({
        id: p.id, name: p.name, type: p.type,
        credentials: JSON.parse(p.credentials),
        enabled: p.enabled, createdAt: p.createdAt,
      })),
      apiKeys: allKeys.map(k => ({
        id: k.id, name: k.name,
        scopes: JSON.parse(k.scopes),
        keyHash: k.keyHash,
        expiresAt: k.expiresAt, createdAt: k.createdAt,
      })),
      alertRules: allAlerts.map(a => ({
        id: a.id, name: a.name, type: a.type,
        targetRouteId: a.targetRouteId,
        config: JSON.parse(a.config),
        enabled: a.enabled, createdAt: a.createdAt,
      })),
      routeTemplates: allTemplates.map(t => ({
        id: t.id, name: t.name, description: t.description,
        config: JSON.parse(t.config),
        builtIn: t.builtIn, createdAt: t.createdAt,
      })),
    }
  }),

  importDryRun: operatorProcedure
    .input(z.object({ data: z.string() }))
    .query(async ({ ctx, input }) => {
      let parsed: ReturnType<typeof JSON.parse>
      try {
        parsed = JSON.parse(input.data)
      } catch {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid JSON' })
      }

      if (parsed.proxyos_export_version !== EXPORT_VERSION) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unsupported export version: ${parsed.proxyos_export_version}` })
      }

      const existingRoutes = await ctx.db.select({ id: routes.id, domain: routes.domain }).from(routes).all()
      const existingDomains = new Set(existingRoutes.map(r => r.domain))
      const existingIds = new Set(existingRoutes.map(r => r.id))

      const importRoutes = (parsed.routes ?? []) as Array<{ id: string; domain: string }>
      const toAdd = importRoutes.filter(r => !existingDomains.has(r.domain) && !existingIds.has(r.id))
      const toUpdate = importRoutes.filter(r => existingDomains.has(r.domain) || existingIds.has(r.id))
      const toRemove = existingRoutes.filter(r => !importRoutes.some(ir => ir.domain === r.domain))

      const existingSso = await ctx.db.select({ id: ssoProviders.id }).from(ssoProviders).all()
      const importSso = (parsed.ssoProviders ?? []) as Array<{ id: string }>
      const ssoAdd = importSso.filter(p => !existingSso.some(e => e.id === p.id))
      const ssoUpdate = importSso.filter(p => existingSso.some(e => e.id === p.id))

      return {
        version: parsed.proxyos_export_version,
        exportedAt: parsed.exportedAt,
        routes: { add: toAdd.length, update: toUpdate.length, remove: toRemove.length },
        ssoProviders: { add: ssoAdd.length, update: ssoUpdate.length },
        dnsProviders: { add: (parsed.dnsProviders ?? []).length },
        alertRules: { add: (parsed.alertRules ?? []).length },
        routeTemplates: { add: (parsed.routeTemplates ?? []).length },
        preview: {
          routesToAdd: toAdd.map(r => r.domain),
          routesToUpdate: toUpdate.map(r => r.domain),
          routesToRemove: toRemove.map(r => r.domain),
        },
      }
    }),

  importApply: operatorProcedure
    .input(z.object({ data: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let parsed: ReturnType<typeof JSON.parse>
      try {
        parsed = JSON.parse(input.data)
      } catch {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid JSON' })
      }
      if (parsed.proxyos_export_version !== EXPORT_VERSION) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unsupported export version: ${parsed.proxyos_export_version}` })
      }

      let imported = 0, skipped = 0

      // Import SSO providers (upsert by id)
      for (const p of (parsed.ssoProviders ?? [])) {
        try {
          const existing = await ctx.db.select({ id: ssoProviders.id }).from(ssoProviders)
            .where(eq(ssoProviders.id, p.id)).get()
          if (!existing) {
            await ctx.db.insert(ssoProviders).values({
              id: p.id, name: p.name, type: p.type,
              forwardAuthUrl: p.forwardAuthUrl,
              authResponseHeaders: JSON.stringify(p.authResponseHeaders ?? []),
              trustedIPs: JSON.stringify(p.trustedIPs ?? []),
              enabled: p.enabled ?? true,
              testStatus: 'unknown',
              createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
            })
          }
        } catch { skipped++ }
      }

      // Import DNS providers (upsert by id)
      for (const p of (parsed.dnsProviders ?? [])) {
        try {
          const existing = await ctx.db.select({ id: dnsProviders.id }).from(dnsProviders)
            .where(eq(dnsProviders.id, p.id)).get()
          if (!existing) {
            await ctx.db.insert(dnsProviders).values({
              id: p.id, name: p.name, type: p.type,
              credentials: JSON.stringify(p.credentials ?? {}),
              enabled: p.enabled ?? true,
              createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
            })
          }
        } catch { skipped++ }
      }

      // Import routes (skip on domain conflict)
      for (const r of (parsed.routes ?? [])) {
        try {
          const existing = await ctx.db.select({ id: routes.id }).from(routes)
            .where(eq(routes.domain, r.domain)).get()
          if (existing) { skipped++; continue }
          const now = new Date()
          await ctx.db.insert(routes).values({
            id: r.id ?? nanoid(),
            name: r.name,
            domain: r.domain,
            enabled: r.enabled ?? true,
            upstreamType: r.upstreamType ?? 'http',
            upstreams: JSON.stringify(r.upstreams ?? []),
            lbPolicy: r.lbPolicy ?? 'round_robin',
            tlsMode: r.tlsMode ?? 'auto',
            tlsDnsProviderId: r.tlsDnsProviderId ?? null,
            ssoEnabled: r.ssoEnabled ?? false,
            ssoProviderId: r.ssoProviderId ?? null,
            rateLimit: r.rateLimit ? JSON.stringify(r.rateLimit) : null,
            ipAllowlist: r.ipAllowlist ? JSON.stringify(r.ipAllowlist) : null,
            basicAuth: r.basicAuth ? JSON.stringify(r.basicAuth) : null,
            headers: r.headers ? JSON.stringify(r.headers) : null,
            healthCheckEnabled: r.healthCheckEnabled ?? true,
            healthCheckPath: r.healthCheckPath ?? '/',
            healthCheckInterval: r.healthCheckInterval ?? 30,
            compressionEnabled: r.compressionEnabled ?? true,
            websocketEnabled: r.websocketEnabled ?? true,
            http2Enabled: r.http2Enabled ?? true,
            http3Enabled: r.http3Enabled ?? true,
            wafMode: r.wafMode ?? 'off',
            wafExclusions: r.wafExclusions ? JSON.stringify(r.wafExclusions) : null,
            tunnelProviderId: r.tunnelProviderId ?? null,
            oauthProxyProviderId: r.oauthProxyProviderId ?? null,
            oauthProxyAllowlist: r.oauthProxyAllowlist ? JSON.stringify(r.oauthProxyAllowlist) : null,
            stagingUpstreams: r.stagingUpstreams ? JSON.stringify(r.stagingUpstreams) : null,
            trafficSplitPct: r.trafficSplitPct ?? null,
            mirrorUpstream: r.mirrorUpstream ?? null,
            mirrorSampleRate: r.mirrorSampleRate ?? null,
            createdAt: r.createdAt ? new Date(r.createdAt) : now,
            updatedAt: now,
          })
          imported++
        } catch { skipped++ }
      }

      // Import alert rules (skip on id conflict)
      for (const a of (parsed.alertRules ?? [])) {
        try {
          const existing = await ctx.db.select({ id: alertRules.id }).from(alertRules)
            .where(eq(alertRules.id, a.id)).get()
          if (!existing) {
            await ctx.db.insert(alertRules).values({
              id: a.id ?? nanoid(),
              name: a.name,
              type: a.type,
              targetRouteId: a.targetRouteId ?? null,
              config: JSON.stringify(a.config ?? {}),
              enabled: a.enabled ?? true,
              createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
            })
            imported++
          }
        } catch { skipped++ }
      }

      // Import route templates (skip built-ins)
      for (const t of (parsed.routeTemplates ?? [])) {
        try {
          if (t.builtIn) continue
          const existing = await ctx.db.select({ id: routeTemplates.id }).from(routeTemplates)
            .where(eq(routeTemplates.id, t.id)).get()
          if (!existing) {
            await ctx.db.insert(routeTemplates).values({
              id: t.id ?? nanoid(),
              name: t.name,
              description: t.description ?? null,
              config: JSON.stringify(t.config ?? {}),
              builtIn: 0,
              createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
            })
            imported++
          }
        } catch { skipped++ }
      }

      return { ok: true, imported, skipped }
    }),
})
