import { TRPCError } from '@trpc/server'
import { eq, lt, gt, and, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { routeSecurity, ipBans, fail2banRules, routes, nanoid } from '@proxyos/db'
import { FAIL2BAN_PRESETS, parseRule } from '../security/fail2ban'
import { HIGH_RISK_COUNTRIES } from '../security/geoip'
import { publicProcedure, router } from '../trpc'

const GeoIPConfigSchema = z.object({
  mode: z.enum(['allowlist', 'blocklist']),
  countries: z.array(z.string().length(2)),
  action: z.enum(['block', 'challenge']),
})

const JWTConfigSchema = z.object({
  jwksUrl: z.string().url(),
  issuer: z.string().optional(),
  audience: z.string().optional(),
  algorithms: z.array(z.string()).default(['RS256']),
  extractClaims: z.array(z.string()).default([]),
  skipPaths: z.array(z.string()).default([]),
})

const Fail2banRuleSchema = z.object({
  name: z.string().min(1),
  filter: z.object({
    statusCode: z.array(z.number()).optional(),
    pathPattern: z.string().optional(),
    userAgentPattern: z.string().optional(),
  }),
  threshold: z.number().int().min(1),
  windowSeconds: z.number().int().min(1),
  banDurationSeconds: z.number().int().min(1),
  routes: z.union([z.array(z.string()), z.literal('all')]),
})

export const securityRouter = router({
  // ── GeoIP ─────────────────────────────────────────────────────────────────

  getGeoIPConfig: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routeSecurity).where(eq(routeSecurity.routeId, input.routeId)).get()
      const raw = row?.geoipConfig ? JSON.parse(row.geoipConfig) : null
      return { config: raw, highRiskPreset: HIGH_RISK_COUNTRIES }
    }),

  setGeoIPConfig: publicProcedure
    .input(z.object({ routeId: z.string(), config: GeoIPConfigSchema.nullable() }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND' })
      const now = new Date()
      await ctx.db.insert(routeSecurity).values({
        routeId: input.routeId,
        geoipConfig: input.config ? JSON.stringify(input.config) : null,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: routeSecurity.routeId,
        set: { geoipConfig: input.config ? JSON.stringify(input.config) : null, updatedAt: now },
      })
      return { ok: true }
    }),

  // ── JWT ───────────────────────────────────────────────────────────────────

  getJWTConfig: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routeSecurity).where(eq(routeSecurity.routeId, input.routeId)).get()
      return { config: row?.jwtConfig ? JSON.parse(row.jwtConfig) : null }
    }),

  setJWTConfig: publicProcedure
    .input(z.object({ routeId: z.string(), config: JWTConfigSchema.nullable() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db.insert(routeSecurity).values({
        routeId: input.routeId,
        jwtConfig: input.config ? JSON.stringify(input.config) : null,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: routeSecurity.routeId,
        set: { jwtConfig: input.config ? JSON.stringify(input.config) : null, updatedAt: now },
      })
      return { ok: true }
    }),

  // ── Fail2ban rules ────────────────────────────────────────────────────────

  listFail2banRules: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(fail2banRules).all()
  }),

  createFail2banRule: publicProcedure
    .input(Fail2banRuleSchema)
    .mutation(async ({ ctx, input }) => {
      const id = nanoid()
      await ctx.db.insert(fail2banRules).values({
        id,
        name: input.name,
        config: JSON.stringify(input),
        enabled: 1,
        hitCount: 0,
        createdAt: new Date(),
      })
      return { id }
    }),

  deleteFail2banRule: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(fail2banRules).where(eq(fail2banRules.id, input.id))
      return { ok: true }
    }),

  toggleFail2banRule: publicProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(fail2banRules)
        .set({ enabled: input.enabled ? 1 : 0 })
        .where(eq(fail2banRules.id, input.id))
      return { ok: true }
    }),

  getPresets: publicProcedure.query(() => FAIL2BAN_PRESETS),

  // ── IP bans ───────────────────────────────────────────────────────────────

  listBans: publicProcedure
    .input(z.object({ includeExpired: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const now = new Date()
      if (input.includeExpired) {
        return ctx.db.select().from(ipBans).all()
      }
      return ctx.db.select().from(ipBans).where(
        or(isNull(ipBans.expiresAt), gt(ipBans.expiresAt, now))
      ).all()
    }),

  banIP: publicProcedure
    .input(z.object({
      ip: z.string(),
      reason: z.string(),
      ruleName: z.string().optional(),
      banDurationSeconds: z.number().int().min(0).optional(),
      routeId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      const expiresAt = input.banDurationSeconds
        ? new Date(now.getTime() + input.banDurationSeconds * 1000)
        : null
      await ctx.db.insert(ipBans).values({
        ip: input.ip,
        reason: input.reason,
        ruleName: input.ruleName ?? null,
        bannedAt: now,
        expiresAt,
        routeId: input.routeId ?? null,
        permanent: input.banDurationSeconds ? 0 : 1,
      }).onConflictDoUpdate({
        target: ipBans.ip,
        set: { reason: input.reason, bannedAt: now, expiresAt, permanent: input.banDurationSeconds ? 0 : 1 },
      })
      return { ok: true }
    }),

  unbanIP: publicProcedure
    .input(z.object({ ip: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(ipBans).where(eq(ipBans.ip, input.ip))
      return { ok: true }
    }),

  // Bulk cleanup expired bans
  purgeExpiredBans: publicProcedure.mutation(async ({ ctx }) => {
    const now = new Date()
    await ctx.db.delete(ipBans).where(
      and(lt(ipBans.expiresAt, now), eq(ipBans.permanent, 0))
    )
    return { ok: true }
  }),
})
