import { createHash } from 'crypto'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { nanoid, pendingChanges, routeOwnership, systemLog, systemSettings, users } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'
import { generateTotpSecret, verifyTotp, buildOtpAuthUri } from '../totp'
import { signToken, makeTokenCookie, clearTokenCookie } from '../auth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function syslog(db: any, level: 'info' | 'warn' | 'error', category: string, message: string, detail?: Record<string, unknown>, userId?: string) {
  return (db.insert(systemLog).values({ id: nanoid(), level, category, message, detail: detail ? JSON.stringify(detail) : null, userId: userId ?? null, createdAt: new Date() }) as Promise<unknown>).catch(() => { /* non-fatal */ })
}

const ROLES = ['admin', 'operator', 'viewer'] as const

function hashPassword(pw: string): string {
  return createHash('sha256').update(pw).digest('hex')
}

// ─── Dashboard SSO config ─────────────────────────────────────────────────────

const DashboardSSOSchema = z.object({
  provider: z.enum(['authentik', 'google', 'github', 'microsoft']),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  allowedDomains: z.array(z.string()).default([]),
  autoProvisionUsers: z.boolean().default(true),
  defaultRole: z.enum(ROLES).default('viewer'),
})

export const usersRouter = router({

  // ── Auth ────────────────────────────────────────────────────────────────────

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string(), totpCode: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const u = await ctx.db.select().from(users).where(eq(users.email, input.email)).get()
      if (!u || !u.passwordHash || u.passwordHash !== hashPassword(input.password)) {
        void syslog(ctx.db, 'warn', 'auth', `Failed login attempt`, { email: input.email })
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' })
      }
      // TOTP check
      if (u.totpEnabled && u.totpSecret) {
        if (!input.totpCode) {
          return { requiresTotp: true as const, id: null, email: null, role: null, displayName: null, avatarColor: null, avatarUrl: null }
        }
        if (!verifyTotp(u.totpSecret, input.totpCode)) {
          void syslog(ctx.db, 'warn', 'auth', `Failed TOTP attempt`, { email: input.email })
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid authenticator code' })
        }
      }
      await ctx.db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, u.id))
      void syslog(ctx.db, 'info', 'auth', `User signed in`, { email: u.email }, u.id)
      const token = signToken({ userId: u.id, role: u.role })
      ctx.resHeaders.append('Set-Cookie', makeTokenCookie(token))
      return { requiresTotp: false as const, id: u.id, email: u.email, role: u.role as typeof ROLES[number], displayName: u.displayName ?? null, avatarColor: u.avatarColor ?? null, avatarUrl: u.avatarUrl ?? null }
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.resHeaders.append('Set-Cookie', clearTokenCookie())
    return { ok: true }
  }),

  register: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(8), displayName: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get()
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' })
      const all = await ctx.db.select({ id: users.id }).from(users).all()
      const role: typeof ROLES[number] = all.length === 0 ? 'admin' : 'viewer'
      const id = nanoid()
      await ctx.db.insert(users).values({ id, email: input.email, passwordHash: hashPassword(input.password), displayName: input.displayName ?? null, role, createdAt: new Date() })
      void syslog(ctx.db, 'info', 'auth', `New user registered`, { email: input.email, role }, id)
      return { id, email: input.email, role, displayName: input.displayName ?? null, avatarColor: null, avatarUrl: null }
    }),

  getProfile: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const u = await ctx.db.select().from(users).where(eq(users.id, input.id)).get()
      if (!u) return null
      return { id: u.id, email: u.email, role: u.role as typeof ROLES[number], displayName: u.displayName ?? null, avatarColor: u.avatarColor ?? null, avatarUrl: u.avatarUrl ?? null, lastLogin: u.lastLogin, createdAt: u.createdAt, totpEnabled: !!u.totpEnabled }
    }),

  updateProfile: publicProcedure
    .input(z.object({
      id: z.string(),
      displayName: z.string().nullable().optional(),
      avatarColor: z.string().nullable().optional(),
      avatarUrl: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(users).set({
        displayName: input.displayName !== undefined ? input.displayName : undefined,
        avatarColor: input.avatarColor !== undefined ? input.avatarColor : undefined,
        avatarUrl: input.avatarUrl !== undefined ? input.avatarUrl : undefined,
      }).where(eq(users.id, input.id))
      return { ok: true }
    }),

  updatePassword: publicProcedure
    .input(z.object({ id: z.string(), currentPassword: z.string(), newPassword: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const u = await ctx.db.select().from(users).where(eq(users.id, input.id)).get()
      if (!u) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!u.passwordHash || u.passwordHash !== hashPassword(input.currentPassword)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
      }
      await ctx.db.update(users).set({ passwordHash: hashPassword(input.newPassword) }).where(eq(users.id, input.id))
      return { ok: true }
    }),

  // ── User management ─────────────────────────────────────────────────────────

  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(users).orderBy(desc(users.createdAt)).all()
    return rows.map(r => ({
      id: r.id,
      email: r.email,
      role: r.role as 'admin' | 'operator' | 'viewer',
      ssoProvider: r.ssoProvider,
      createdAt: r.createdAt,
      lastLogin: r.lastLogin,
    }))
  }),

  create: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8).optional(),
      role: z.enum(ROLES).default('viewer'),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = nanoid()
      const now = new Date()
      await ctx.db.insert(users).values({
        id,
        email: input.email,
        passwordHash: input.password ? hashPassword(input.password) : null,
        role: input.role,
        createdAt: now,
      })
      return { id }
    }),

  updateRole: publicProcedure
    .input(z.object({ id: z.string(), role: z.enum(ROLES) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(users).set({ role: input.role }).where(eq(users.id, input.id))
      return { ok: true }
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(users).where(eq(users.id, input.id))
      return { ok: true }
    }),

  // ── TOTP ────────────────────────────────────────────────────────────────────

  setupTotp: publicProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const u = await ctx.db.select().from(users).where(eq(users.id, input.userId)).get()
      if (!u) throw new TRPCError({ code: 'NOT_FOUND' })
      const secret = generateTotpSecret()
      const uri = buildOtpAuthUri(secret, u.email)
      return { secret, uri }
    }),

  verifyAndEnableTotp: publicProcedure
    .input(z.object({ userId: z.string(), secret: z.string(), code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const u = await ctx.db.select().from(users).where(eq(users.id, input.userId)).get()
      if (!u) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!verifyTotp(input.secret, input.code)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid code — check your authenticator app and try again' })
      }
      await ctx.db.update(users).set({ totpSecret: input.secret, totpEnabled: 1 }).where(eq(users.id, input.userId))
      void syslog(ctx.db, 'info', 'auth', 'TOTP enabled', { userId: input.userId }, input.userId)
      return { ok: true }
    }),

  disableTotp: publicProcedure
    .input(z.object({ userId: z.string(), password: z.string(), code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const u = await ctx.db.select().from(users).where(eq(users.id, input.userId)).get()
      if (!u) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!u.passwordHash || u.passwordHash !== hashPassword(input.password)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect password' })
      }
      if (!u.totpSecret || !verifyTotp(u.totpSecret, input.code)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid authenticator code' })
      }
      await ctx.db.update(users).set({ totpSecret: null, totpEnabled: 0 }).where(eq(users.id, input.userId))
      void syslog(ctx.db, 'info', 'auth', 'TOTP disabled', { userId: input.userId }, input.userId)
      return { ok: true }
    }),

  // ── Route ownership ─────────────────────────────────────────────────────────

  getRouteOwner: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routeOwnership).where(eq(routeOwnership.routeId, input.routeId)).get()
      if (!row) return null
      const user = await ctx.db.select().from(users).where(eq(users.id, row.userId)).get()
      return user ? { userId: user.id, email: user.email, assignedAt: row.assignedAt } : null
    }),

  claimRoute: publicProcedure
    .input(z.object({ routeId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db.insert(routeOwnership).values({ routeId: input.routeId, userId: input.userId, assignedAt: now })
        .onConflictDoUpdate({ target: routeOwnership.routeId, set: { userId: input.userId, assignedAt: now } })
      return { ok: true }
    }),

  releaseRoute: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(routeOwnership).where(eq(routeOwnership.routeId, input.routeId))
      return { ok: true }
    }),

  // ── Dashboard SSO config ────────────────────────────────────────────────────

  getDashboardSSO: publicProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'dashboard_sso')).get()
    if (!row) return null
    try { return DashboardSSOSchema.parse(JSON.parse(row.value)) } catch { return null }
  }),

  setDashboardSSO: publicProcedure
    .input(DashboardSSOSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      // Redact client secret in stored value for GET — store full value since db is encrypted at rest
      await ctx.db.insert(systemSettings).values({ key: 'dashboard_sso', value: JSON.stringify(input), updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(input), updatedAt: now } })
      return { ok: true }
    }),

  deleteDashboardSSO: publicProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(systemSettings).where(eq(systemSettings.key, 'dashboard_sso'))
    return { ok: true }
  }),
})
