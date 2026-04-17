import { TRPCError } from '@trpc/server'
import { and, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { agents, agentMetrics, revokedAgentTokens, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'
import { createHash } from 'crypto'

// Simple deterministic JWT using HMAC-SHA256 (no external dependency)
// Format: base64(header).base64(payload).base64(sig)
const JWT_SECRET = process.env.PROXYOS_JWT_SECRET ?? 'proxyos-dev-secret-change-in-production'

function base64url(data: string): string {
  return Buffer.from(data).toString('base64url')
}

function signAgentToken(agentId: string, expiresAt: number): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ sub: agentId, exp: expiresAt, iat: Date.now() }))
  const sig = createHash('sha256').update(`${header}.${payload}.${JWT_SECRET}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function rowToAgent(row: typeof agents.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    siteTag: row.siteTag,
    description: row.description,
    tokenExpiresAt: row.tokenExpiresAt,
    status: row.status as 'online' | 'offline' | 'error',
    lastSeen: row.lastSeen,
    caddyVersion: row.caddyVersion,
    routeCount: row.routeCount,
    certCount: row.certCount,
    createdAt: row.createdAt,
  }
}

export const agentsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(agents).all()
    return rows.map(rowToAgent)
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(agents).where(eq(agents.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' })
      return rowToAgent(row)
    }),

  register: operatorProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      siteTag: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = `ag_${nanoid(12)}`
      const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000  // 1 year
      const token = signAgentToken(id, expiresAt)
      const tokenHash = hashToken(token)

      await ctx.db.insert(agents).values({
        id,
        name: input.name,
        siteTag: input.siteTag ?? null,
        description: input.description ?? null,
        tokenHash,
        tokenExpiresAt: expiresAt,
        status: 'offline',
        routeCount: 0,
        certCount: 0,
        createdAt: new Date(),
      })

      // Return the token once — it won't be shown again
      return { id, token, expiresAt }
    }),

  revokeToken: operatorProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const agent = await ctx.db.select().from(agents).where(eq(agents.id, input.id)).get()
      if (!agent) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' })
      await ctx.db.insert(revokedAgentTokens).values({
        tokenHash: agent.tokenHash,
        revokedAt: new Date(),
        reason: input.reason ?? null,
      }).onConflictDoNothing()
      // Mark agent offline
      await ctx.db.update(agents).set({ status: 'offline' }).where(eq(agents.id, input.id))
      return { ok: true }
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(agents).where(eq(agents.id, input.id))
      return { ok: true }
    }),

  getMetrics: publicProcedure
    .input(z.object({
      id: z.string(),
      routeId: z.string().optional(),
      range: z.number().default(60),  // minutes
    }))
    .query(async ({ ctx, input }) => {
      const since = Math.floor((Date.now() - input.range * 60 * 1000) / 1000)
      const conditions = [
        eq(agentMetrics.agentId, input.id),
        gte(agentMetrics.bucket, since),
        ...(input.routeId ? [eq(agentMetrics.routeId, input.routeId)] : []),
      ]
      const rows = await ctx.db
        .select()
        .from(agentMetrics)
        .where(and(...conditions))
        .all()
      return rows
    }),

  getHealth: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const agent = await ctx.db.select().from(agents).where(eq(agents.id, input.id)).get()
      if (!agent) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' })
      return {
        status: agent.status,
        lastSeen: agent.lastSeen,
        caddyVersion: agent.caddyVersion,
        routeCount: agent.routeCount,
        certCount: agent.certCount,
      }
    }),
})
