import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auditLog, nanoid, ssoProviders } from '@proxyos/db'
import { getDriver, testForwardAuth } from '@proxyos/sso'
import type { SSOProvider, SSOProviderType } from '@proxyos/types'
import { publicProcedure, router } from '../trpc'

const providerTypes = ['authentik', 'authelia', 'keycloak', 'zitadel'] as const

function rowToProvider(row: typeof ssoProviders.$inferSelect): SSOProvider {
  return {
    id: row.id,
    name: row.name,
    type: row.type as SSOProviderType,
    forwardAuthUrl: row.forwardAuthUrl,
    authResponseHeaders: JSON.parse(row.authResponseHeaders) as string[],
    trustedIPs: JSON.parse(row.trustedIPs) as string[],
    enabled: row.enabled,
    lastTestedAt: row.lastTestedAt,
    testStatus: row.testStatus as SSOProvider['testStatus'],
    createdAt: row.createdAt,
  }
}

export const ssoRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(ssoProviders)
    return rows.map(rowToProvider)
  }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        type: z.enum(providerTypes),
        baseUrl: z.string().url(),
        authResponseHeaders: z.array(z.string()).optional(),
        trustedIPs: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const driver = getDriver(input.type)
      const forwardAuthUrl = driver.buildForwardAuthUrl(input.baseUrl)
      const headers = input.authResponseHeaders ?? driver.defaultResponseHeaders()

      const id = nanoid()
      const now = new Date()
      await ctx.db.insert(ssoProviders).values({
        id,
        name: input.name,
        type: input.type,
        forwardAuthUrl,
        authResponseHeaders: JSON.stringify(headers),
        trustedIPs: JSON.stringify(input.trustedIPs),
        enabled: true,
        testStatus: 'unknown',
        createdAt: now,
      })
      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'sso.create',
        resourceType: 'sso_provider',
        resourceId: id,
        resourceName: input.name,
        actor: 'user',
        detail: JSON.stringify({ type: input.type }),
        createdAt: now,
      })
      return { id, forwardAuthUrl }
    }),

  update: publicProcedure
    .input(z.object({
      id: z.string(),
      patch: z.object({
        name: z.string().min(1).max(100).optional(),
        baseUrl: z.string().url().optional(),
        authResponseHeaders: z.array(z.string()).optional(),
        trustedIPs: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(ssoProviders).where(eq(ssoProviders.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const update: Record<string, unknown> = {}
      if (input.patch.name !== undefined) update.name = input.patch.name
      if (input.patch.baseUrl !== undefined) {
        const driver = getDriver(row.type as Parameters<typeof getDriver>[0])
        update.forwardAuthUrl = driver.buildForwardAuthUrl(input.patch.baseUrl)
      }
      if (input.patch.authResponseHeaders !== undefined) update.authResponseHeaders = JSON.stringify(input.patch.authResponseHeaders)
      if (input.patch.trustedIPs !== undefined) update.trustedIPs = JSON.stringify(input.patch.trustedIPs)
      if (input.patch.enabled !== undefined) update.enabled = input.patch.enabled
      await ctx.db.update(ssoProviders).set(update).where(eq(ssoProviders.id, input.id))
      return { success: true }
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(ssoProviders).where(eq(ssoProviders.id, input.id)).get()
      await ctx.db.delete(ssoProviders).where(eq(ssoProviders.id, input.id))
      if (row) {
        await ctx.db.insert(auditLog).values({
          id: nanoid(),
          action: 'sso.delete',
          resourceType: 'sso_provider',
          resourceId: input.id,
          resourceName: row.name,
          actor: 'user',
          createdAt: new Date(),
        })
      }
      return { success: true }
    }),

  test: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(ssoProviders).where(eq(ssoProviders.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const result = await testForwardAuth(row.forwardAuthUrl)
      await ctx.db
        .update(ssoProviders)
        .set({
          lastTestedAt: new Date(),
          testStatus: result.ok ? 'ok' : 'error',
        })
        .where(eq(ssoProviders.id, input.id))
      return result
    }),
})
