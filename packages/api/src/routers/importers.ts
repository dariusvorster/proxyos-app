import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { importSessions, routes, nanoid } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'
import {
  parseNginxConfig, nginxBlockToProxyOSRoute,
  parseNPMRows, type NPMProxyHost,
  fetchTraefikRouters, fetchTraefikServices, traefikRouterToProxyOSRoute,
  fetchCaddyConfig, parseCaddyConfig,
  parseApacheConfig, apacheVhostToProxyOSRoute,
  parseHAProxyConfig, buildHAProxyRoutes,
  parseTraefikYAML, parseTraefikTOML,
  type ImportedRoute,
} from '@proxyos/importers'

const sourceTypeSchema = z.enum(['nginx', 'npm', 'traefik', 'caddy', 'apache', 'haproxy'])

// In-memory preview cache (cleared on restart, fine for import wizard flow)
const previewCache = new Map<string, ImportedRoute[]>()

export const importersRouter = router({
  preview: publicProcedure
    .input(z.object({
      sourceType: sourceTypeSchema,
      // text content (for file-upload parsers)
      content: z.string().optional(),
      // URL (for live API parsers)
      apiUrl: z.string().optional(),
      // JSON rows (for NPM DB reader)
      npmRows: z.array(z.record(z.unknown())).optional(),
    }))
    .mutation(async ({ input }) => {
      const sessionId = nanoid(16)
      let importedRoutes: ImportedRoute[] = []
      const parseErrors: string[] = []

      try {
        switch (input.sourceType) {
          case 'nginx': {
            if (!input.content) throw new TRPCError({ code: 'BAD_REQUEST', message: 'content required for nginx' })
            const blocks = parseNginxConfig(input.content)
            importedRoutes = blocks.map(nginxBlockToProxyOSRoute)
            break
          }
          case 'npm': {
            if (input.npmRows) {
              importedRoutes = parseNPMRows(input.npmRows as unknown as NPMProxyHost[])
            } else if (input.content) {
              const rows = JSON.parse(input.content) as NPMProxyHost[]
              importedRoutes = parseNPMRows(rows)
            } else {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'npmRows or content required for npm' })
            }
            break
          }
          case 'traefik': {
            if (input.apiUrl) {
              const [traefikRouters, services] = await Promise.all([
                fetchTraefikRouters(input.apiUrl),
                fetchTraefikServices(input.apiUrl),
              ])
              importedRoutes = traefikRouters
                .map(r => traefikRouterToProxyOSRoute(r, services))
                .filter((r): r is ImportedRoute => r !== null)
            } else if (input.content) {
              // Detect YAML vs TOML
              const parsed = input.content.trimStart().startsWith('[')
                ? parseTraefikTOML(input.content)
                : parseTraefikYAML(input.content)
              importedRoutes = parsed.routers
                .map(r => traefikRouterToProxyOSRoute(r, parsed.services))
                .filter((r): r is ImportedRoute => r !== null)
            } else {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'apiUrl or content required for traefik' })
            }
            break
          }
          case 'caddy': {
            if (input.apiUrl) {
              const config = await fetchCaddyConfig(input.apiUrl)
              importedRoutes = parseCaddyConfig(config)
            } else {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'apiUrl required for caddy' })
            }
            break
          }
          case 'apache': {
            if (!input.content) throw new TRPCError({ code: 'BAD_REQUEST', message: 'content required for apache' })
            const vhosts = parseApacheConfig(input.content)
            importedRoutes = vhosts.map(apacheVhostToProxyOSRoute)
            break
          }
          case 'haproxy': {
            if (!input.content) throw new TRPCError({ code: 'BAD_REQUEST', message: 'content required for haproxy' })
            const { frontends, backends } = parseHAProxyConfig(input.content)
            importedRoutes = buildHAProxyRoutes(frontends, backends)
            break
          }
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err
        parseErrors.push(err instanceof Error ? err.message : String(err))
      }

      previewCache.set(sessionId, importedRoutes)
      return { sessionId, sourceType: input.sourceType, routes: importedRoutes, parseErrors }
    }),

  commit: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      // Subset of route indices to commit; if omitted, commit all canAutoImport ones
      routeIndices: z.array(z.number()).optional(),
      agentId: z.string().nullable().optional(),
      defaultTlsMode: z.enum(['auto', 'dns', 'internal', 'custom', 'off']).default('auto'),
    }))
    .mutation(async ({ ctx, input }) => {
      const cached = previewCache.get(input.sessionId)
      if (!cached) throw new TRPCError({ code: 'NOT_FOUND', message: 'Preview session not found or expired' })

      const toImport = input.routeIndices
        ? input.routeIndices.map(i => cached[i]).filter((r): r is ImportedRoute => !!r)
        : cached.filter(r => r.canAutoImport)

      const created: string[] = []
      const skipped: string[] = []
      const failed: Array<{ domain: string; error: string }> = []

      for (const route of toImport) {
        if (!route.domain || !route.upstream) {
          skipped.push(route.domain || '(unknown)')
          continue
        }
        try {
          const id = nanoid()
          await ctx.db.insert(routes).values({
            id,
            name: route.domain,
            domain: route.domain,
            enabled: true,
            upstreamType: 'http',
            upstreams: JSON.stringify([{ address: route.upstream }]),
            tlsMode: route.suggestedTlsMode ?? input.defaultTlsMode,
            ssoEnabled: route.ssoDetected,
            ssoProviderId: null,
            tlsDnsProviderId: null,
            compressionEnabled: route.compressionDetected,
            websocketEnabled: route.websocketDetected,
            healthCheckEnabled: true,
            healthCheckPath: '/',
            healthCheckInterval: 30,
            http2Enabled: true,
            http3Enabled: true,
            ipAllowlist: route.ipAllowlist ? JSON.stringify(route.ipAllowlist) : null,
            rateLimit: route.rateLimitRpm
              ? JSON.stringify({ requests: route.rateLimitRpm, window: '1m' })
              : null,
            basicAuth: null,
            headers: null,
            agentId: input.agentId ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          created.push(id)
        } catch (err) {
          failed.push({ domain: route.domain, error: err instanceof Error ? err.message : String(err) })
        }
      }

      // Persist session record
      await ctx.db.insert(importSessions).values({
        id: input.sessionId,
        sourceType: cached[0]?.sourceType ?? 'nginx',
        createdAt: new Date(),
        routeCount: cached.length,
        imported: created.length,
        skipped: skipped.length,
        failed: failed.length,
        resultJson: JSON.stringify({ created, skipped, failed }),
      })

      previewCache.delete(input.sessionId)
      return { sessionId: input.sessionId, created, skipped, failed }
    }),

  getSession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(importSessions)
        .where(eq(importSessions.id, input.sessionId)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Import session not found' })
      return {
        id: row.id,
        sourceType: row.sourceType,
        createdAt: row.createdAt,
        routeCount: row.routeCount,
        imported: row.imported,
        skipped: row.skipped,
        failed: row.failed,
        result: row.resultJson ? JSON.parse(row.resultJson) as unknown : null,
      }
    }),

  listSessions: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(importSessions)
      .orderBy(importSessions.createdAt)
      .limit(100)
      .all()
    return rows.map(row => ({
      id: row.id,
      sourceType: row.sourceType,
      createdAt: row.createdAt,
      routeCount: row.routeCount,
      imported: row.imported,
      skipped: row.skipped,
      failed: row.failed,
    }))
  }),
})
