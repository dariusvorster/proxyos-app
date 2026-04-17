import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { routes, routeTemplates, nanoid, auditLog } from '@proxyos/db'
import { tokenScopeProcedure, router } from '../trpc'

const SERVICE_TEMPLATE_MAP: Record<string, string> = {
  gitea: 'homelab-service',
  gitlab: 'homelab-service',
  nextcloud: 'homelab-service',
  jellyfin: 'homelab-service',
  plex: 'homelab-service',
  grafana: 'homelab-service',
  portainer: 'homelab-service',
  vaultwarden: 'homelab-service',
  postgres: 'database-ui',
  mysql: 'database-ui',
  adminer: 'database-ui',
  phpmyadmin: 'database-ui',
}

function detectTemplate(hint: string): string {
  const lower = hint.toLowerCase()
  return Object.entries(SERVICE_TEMPLATE_MAP).find(([k]) => lower.includes(k))?.[1] ?? 'homelab-service'
}

export const infraosRouter = router({
  createRoute: tokenScopeProcedure('routes:write')
    .input(z.object({
      name: z.string().min(1).max(100),
      domain: z.string().min(1).max(253),
      upstream: z.string().min(1),
      templateHint: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select({ id: routes.id }).from(routes)
        .where(eq(routes.domain, input.domain)).get()
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: `Domain ${input.domain} already exists` })

      const templateName = detectTemplate(input.templateHint ?? input.name)
      const template = await ctx.db.select().from(routeTemplates)
        .where(eq(routeTemplates.name, templateName)).get()
      const cfg = template ? JSON.parse(template.config) as Record<string, unknown> : {}

      const now = new Date()
      const id = nanoid()
      await ctx.db.insert(routes).values({
        id,
        name: input.name,
        domain: input.domain,
        enabled: true,
        upstreamType: 'http',
        upstreams: JSON.stringify([{ address: input.upstream }]),
        lbPolicy: 'round_robin',
        tlsMode: (cfg.tlsMode as string) ?? 'auto',
        ssoEnabled: Boolean(cfg.ssoEnabled),
        ssoProviderId: (cfg.ssoProviderId as string) ?? null,
        compressionEnabled: cfg.compressionEnabled !== false,
        websocketEnabled: cfg.websocketEnabled !== false,
        http2Enabled: true,
        http3Enabled: cfg.http3Enabled !== false,
        healthCheckEnabled: true,
        healthCheckPath: (cfg.healthCheckPath as string) ?? '/',
        healthCheckInterval: 30,
        wafMode: (cfg.wafMode as string) ?? 'off',
        createdAt: now,
        updatedAt: now,
      })

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'route.create',
        resourceType: 'route',
        resourceId: id,
        resourceName: input.domain,
        actor: 'infraos',
        detail: JSON.stringify({ upstream: input.upstream, template: templateName }),
        createdAt: now,
      })

      return { id, domain: input.domain, templateApplied: templateName }
    }),
})
