import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { tunnelProviders, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'

const credentialsSchema = z.object({
  // Cloudflare Tunnel
  accountId: z.string().optional(),
  apiToken: z.string().optional(),
  tunnelId: z.string().optional(),
  tunnelSecret: z.string().optional(),
  // Tailscale
  authKey: z.string().optional(),
  // ngrok
  authToken: z.string().optional(),
  reservedDomain: z.string().optional(),
})

export const tunnelProvidersRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(tunnelProviders)
    return rows.map(r => ({
      id: r.id,
      type: r.type as 'cloudflare' | 'tailscale' | 'ngrok',
      name: r.name,
      enabled: r.enabled,
      status: r.status as 'connected' | 'disconnected' | 'error',
      lastTestedAt: r.lastTestedAt,
      createdAt: r.createdAt,
    }))
  }),

  create: operatorProcedure
    .input(z.object({
      type: z.enum(['cloudflare', 'tailscale', 'ngrok']),
      name: z.string().min(1).max(100),
      credentials: credentialsSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const id = nanoid()
      await ctx.db.insert(tunnelProviders).values({
        id,
        type: input.type,
        name: input.name,
        credentials: JSON.stringify(input.credentials),
        enabled: false,
        status: 'disconnected',
        createdAt: new Date(),
      })
      return { id, success: true }
    }),

  update: operatorProcedure
    .input(z.object({
      id: z.string(),
      patch: z.object({
        name: z.string().min(1).max(100).optional(),
        credentials: credentialsSchema.optional(),
        enabled: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(tunnelProviders).where(eq(tunnelProviders.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const update: Record<string, unknown> = {}
      if (input.patch.name !== undefined) update.name = input.patch.name
      if (input.patch.credentials !== undefined) update.credentials = JSON.stringify(input.patch.credentials)
      if (input.patch.enabled !== undefined) update.enabled = input.patch.enabled
      await ctx.db.update(tunnelProviders).set(update).where(eq(tunnelProviders.id, input.id))
      return { success: true }
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(tunnelProviders).where(eq(tunnelProviders.id, input.id))
      return { success: true }
    }),

  test: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(tunnelProviders).where(eq(tunnelProviders.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      const creds = JSON.parse(row.credentials) as Record<string, string>
      let ok = false
      let message = ''

      if (row.type === 'cloudflare') {
        try {
          const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/cfd_tunnel`, {
            headers: { Authorization: `Bearer ${creds.apiToken}` },
            signal: AbortSignal.timeout(5000),
          })
          ok = res.ok
          message = res.ok ? 'Cloudflare API reachable' : `Cloudflare API error: ${res.status}`
        } catch (err) {
          message = (err as Error).message
        }
      } else if (row.type === 'ngrok') {
        try {
          const res = await fetch('https://api.ngrok.com/tunnels', {
            headers: { Authorization: `Bearer ${creds.authToken}`, 'Ngrok-Version': '2' },
            signal: AbortSignal.timeout(5000),
          })
          ok = res.ok
          message = res.ok ? 'ngrok API reachable' : `ngrok API error: ${res.status}`
        } catch (err) {
          message = (err as Error).message
        }
      } else {
        ok = true
        message = 'Tailscale credentials saved (runtime verification requires tailscaled running)'
      }

      await ctx.db.update(tunnelProviders).set({
        status: ok ? 'connected' : 'error',
        lastTestedAt: new Date(),
      }).where(eq(tunnelProviders.id, input.id))

      return { ok, message }
    }),
})
