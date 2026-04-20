import { createHash } from 'crypto'
import { hash as bcryptHash, compare as bcryptCompare } from 'bcryptjs'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { nanoid, pendingChanges, routeOwnership, systemLog, systemSettings, users } from '@proxyos/db'
import { publicProcedure, protectedProcedure, operatorProcedure, adminProcedure, router } from '../trpc'
import { generateTotpSecret, verifyTotp, buildOtpAuthUri } from '../totp'
import QRCode from 'qrcode'
import { signToken, makeTokenCookie, clearTokenCookie } from '../auth'
import { encrypt, decrypt } from '../crypto'
import { recordFailure, isBlocked, clearLimit, beginAttempt, endAttempt } from '../rateLimiter'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function syslog(db: any, level: 'info' | 'warn' | 'error', category: string, message: string, detail?: Record<string, unknown>, userId?: string) {
  return (db.insert(systemLog).values({ id: nanoid(), level, category, message, detail: detail ? JSON.stringify(detail) : null, userId: userId ?? null, createdAt: new Date() }) as Promise<unknown>).catch(() => { /* non-fatal */ })
}

const ROLES = ['admin', 'operator', 'viewer'] as const

/** Legacy SHA-256 hash — used only for migration detection */
function sha256Hash(pw: string): string {
  return createHash('sha256').update(pw).digest('hex')
}

/** Returns true if the stored hash is a legacy SHA-256 hex string (not bcrypt) */
function isLegacyHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/.test(hash)
}

async function hashPassword(pw: string): Promise<string> {
  return bcryptHash(pw, 12)
}

async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  if (isLegacyHash(stored)) return sha256Hash(pw) === stored
  return bcryptCompare(pw, stored)
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
      // Rate limit: 5 failures per email, 20 per IP within 15 minutes.
      // beginAttempt reserves a slot synchronously before bcrypt so concurrent
      // requests cannot all bypass a full bucket (TOCTOU fix).
      const emailKey = `email:${input.email}`
      const ipKey = `ip:${ctx.clientIp}`
      const emailSlot = beginAttempt(emailKey, 5)
      const ipSlot = beginAttempt(ipKey, 20)
      if (!emailSlot.allowed || !ipSlot.allowed) {
        // Release slots we reserved before discovering we're blocked
        endAttempt(emailKey)
        endAttempt(ipKey)
        const secs = Math.max(emailSlot.retryAfterSeconds ?? 0, ipSlot.retryAfterSeconds ?? 0)
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: `Too many failed attempts. Try again in ${Math.ceil(secs / 60)} minute(s).` })
      }

      let u, passwordOk
      try {
        u = await ctx.db.select().from(users).where(eq(users.email, input.email)).get()
        passwordOk = u?.passwordHash ? await verifyPassword(input.password, u.passwordHash) : false
      } finally {
        endAttempt(emailKey)
        endAttempt(ipKey)
      }
      if (!u || !passwordOk) {
        recordFailure(emailKey, 5)
        recordFailure(ipKey, 20)
        void syslog(ctx.db, 'warn', 'auth', `Failed login attempt`, { email: input.email, ip: ctx.clientIp })
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' })
      }

      // Transparently upgrade legacy SHA-256 hashes to bcrypt on successful login
      if (u.passwordHash && isLegacyHash(u.passwordHash)) {
        const upgraded = await hashPassword(input.password)
        void ctx.db.update(users).set({ passwordHash: upgraded }).where(eq(users.id, u.id)).catch(() => {})
      }
      // TOTP check
      if (u.totpEnabled && u.totpSecret) {
        if (!input.totpCode) {
          return { requiresTotp: true as const, id: null, email: null, role: null, displayName: null, avatarColor: null, avatarUrl: null }
        }
        const matchedCounter = verifyTotp(decrypt(u.totpSecret), input.totpCode, u.totpLastCounter)
        if (matchedCounter === null) {
          recordFailure(emailKey, 5)
          recordFailure(ipKey, 20)
          void syslog(ctx.db, 'warn', 'auth', `Failed TOTP attempt`, { email: input.email })
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid authenticator code' })
        }
        void ctx.db.update(users).set({ totpLastCounter: matchedCounter }).where(eq(users.id, u.id)).catch(() => {})
      }
      // Clear rate limit counters only after both password and TOTP pass
      clearLimit(emailKey)
      clearLimit(ipKey)
      await ctx.db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, u.id))
      void syslog(ctx.db, 'info', 'auth', `User signed in`, { email: u.email }, u.id)
      const token = signToken({ userId: u.id, role: u.role })
      const setCookie = makeTokenCookie(token, ctx.req)
      // Best-effort: try resHeaders (works in dev, broken in standalone build)
      if (ctx.resHeaders && typeof ctx.resHeaders.append === 'function') {
        ctx.resHeaders.append('Set-Cookie', setCookie)
      }
      // The __setCookie field below is consumed by the Next.js route handler
      // as a fallback mechanism when resHeaders is unavailable (Next.js standalone bug)
      return { requiresTotp: false as const, id: u.id, email: u.email, role: u.role as typeof ROLES[number], displayName: u.displayName ?? null, avatarColor: u.avatarColor ?? null, avatarUrl: u.avatarUrl ?? null, __setCookie: setCookie }
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const setCookie = clearTokenCookie(ctx.req)
    // Best-effort resHeaders append
    if (ctx.resHeaders && typeof ctx.resHeaders.append === 'function') {
      ctx.resHeaders.append('Set-Cookie', setCookie)
    }
    return { ok: true, __setCookie: setCookie }
  }),

  register: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(8), displayName: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const ipKey = `register:ip:${ctx.clientIp}`
      const slot = beginAttempt(ipKey, 5)
      if (!slot.allowed) {
        endAttempt(ipKey)
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many registration attempts. Try again later.' })
      }
      endAttempt(ipKey)
      const existing = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get()
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' })
      const all = await ctx.db.select({ id: users.id }).from(users).all()
      const role: typeof ROLES[number] = all.length === 0 ? 'admin' : 'viewer'
      const id = nanoid()
      await ctx.db.insert(users).values({ id, email: input.email, passwordHash: await hashPassword(input.password), displayName: input.displayName ?? null, role, createdAt: new Date() })
      void syslog(ctx.db, 'info', 'auth', `New user registered`, { email: input.email, role }, id)
      return { id, email: input.email, role, displayName: input.displayName ?? null, avatarColor: null, avatarUrl: null }
    }),

  getProfile: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      if (ctx.session.userId !== input.id && ctx.session.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const u = await ctx.db.select().from(users).where(eq(users.id, input.id)).get()
      if (!u) return null
      return { id: u.id, email: u.email, role: u.role as typeof ROLES[number], displayName: u.displayName ?? null, avatarColor: u.avatarColor ?? null, avatarUrl: u.avatarUrl ?? null, lastLogin: u.lastLogin, createdAt: u.createdAt, totpEnabled: !!u.totpEnabled }
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      id: z.string(),
      displayName: z.string().nullable().optional(),
      avatarColor: z.string().nullable().optional(),
      avatarUrl: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.userId !== input.id && ctx.session.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      await ctx.db.update(users).set({
        displayName: input.displayName !== undefined ? input.displayName : undefined,
        avatarColor: input.avatarColor !== undefined ? input.avatarColor : undefined,
        avatarUrl: input.avatarUrl !== undefined ? input.avatarUrl : undefined,
      }).where(eq(users.id, input.id))
      return { ok: true }
    }),

  updatePassword: protectedProcedure
    .input(z.object({ id: z.string(), currentPassword: z.string().optional(), newPassword: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.userId !== input.id && ctx.session.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const u = await ctx.db.select().from(users).where(eq(users.id, input.id)).get()
      if (!u) throw new TRPCError({ code: 'NOT_FOUND' })
      // Admins changing another user's password skip the current-password check
      const isAdminReset = ctx.session.role === 'admin' && ctx.session.userId !== input.id
      if (!isAdminReset) {
        if (!input.currentPassword || !u.passwordHash || !(await verifyPassword(input.currentPassword, u.passwordHash))) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' })
        }
      }
      await ctx.db.update(users).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(users.id, input.id))
      return { ok: true }
    }),

  // ── User management ─────────────────────────────────────────────────────────

  list: adminProcedure.query(async ({ ctx }) => {
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

  create: adminProcedure
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
        passwordHash: input.password ? await hashPassword(input.password) : null,
        role: input.role,
        createdAt: now,
      })
      return { id }
    }),

  updateRole: adminProcedure
    .input(z.object({ id: z.string(), role: z.enum(ROLES) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(users).set({ role: input.role }).where(eq(users.id, input.id))
      return { ok: true }
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(users).where(eq(users.id, input.id))
      return { ok: true }
    }),

  // ── TOTP ────────────────────────────────────────────────────────────────────

  setupTotp: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.userId !== input.userId && ctx.session.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const u = await ctx.db.select().from(users).where(eq(users.id, input.userId)).get()
      if (!u) throw new TRPCError({ code: 'NOT_FOUND' })
      const secret = generateTotpSecret()
      const uri = buildOtpAuthUri(secret, u.email)
      const qrSvg = await QRCode.toString(uri, { type: 'svg', width: 200, margin: 2 })
      return { secret, uri, qrSvg }
    }),

  verifyAndEnableTotp: protectedProcedure
    .input(z.object({ userId: z.string(), secret: z.string(), code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.userId !== input.userId && ctx.session.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const u = await ctx.db.select().from(users).where(eq(users.id, input.userId)).get()
      if (!u) throw new TRPCError({ code: 'NOT_FOUND' })
      if (verifyTotp(input.secret, input.code) === null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid code — check your authenticator app and try again' })
      }
      await ctx.db.update(users).set({ totpSecret: encrypt(input.secret), totpEnabled: 1 }).where(eq(users.id, input.userId))
      void syslog(ctx.db, 'info', 'auth', 'TOTP enabled', { userId: input.userId }, input.userId)
      return { ok: true }
    }),

  disableTotp: protectedProcedure
    .input(z.object({ userId: z.string(), password: z.string(), code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.userId !== input.userId && ctx.session.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const u = await ctx.db.select().from(users).where(eq(users.id, input.userId)).get()
      if (!u) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!u.passwordHash || !(await verifyPassword(input.password, u.passwordHash))) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect password' })
      }
      if (!u.totpSecret || verifyTotp(decrypt(u.totpSecret), input.code, u.totpLastCounter) === null) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid authenticator code' })
      }
      await ctx.db.update(users).set({ totpSecret: null, totpEnabled: 0 }).where(eq(users.id, input.userId))
      void syslog(ctx.db, 'info', 'auth', 'TOTP disabled', { userId: input.userId }, input.userId)
      return { ok: true }
    }),

  // ── Route ownership ─────────────────────────────────────────────────────────

  getRouteOwner: protectedProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routeOwnership).where(eq(routeOwnership.routeId, input.routeId)).get()
      if (!row) return null
      const user = await ctx.db.select().from(users).where(eq(users.id, row.userId)).get()
      return user ? { userId: user.id, email: user.email, assignedAt: row.assignedAt } : null
    }),

  claimRoute: operatorProcedure
    .input(z.object({ routeId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.userId !== input.userId && ctx.session.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const now = new Date()
      await ctx.db.insert(routeOwnership).values({ routeId: input.routeId, userId: input.userId, assignedAt: now })
        .onConflictDoUpdate({ target: routeOwnership.routeId, set: { userId: input.userId, assignedAt: now } })
      return { ok: true }
    }),

  releaseRoute: operatorProcedure
    .input(z.object({ routeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(routeOwnership).where(eq(routeOwnership.routeId, input.routeId))
      return { ok: true }
    }),

  // ── Dashboard SSO config ────────────────────────────────────────────────────

  // Public endpoint — returns SSO provider info for the login page but strips clientSecret
  getDashboardSSO: publicProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'dashboard_sso')).get()
    if (!row) return null
    try {
      const cfg = DashboardSSOSchema.parse(JSON.parse(row.value))
      const { clientSecret: _redacted, ...safe } = cfg
      return safe
    } catch { return null }
  }),

  // Admin-only — returns full config including clientSecret for the settings panel
  getDashboardSSOConfig: adminProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'dashboard_sso')).get()
    if (!row) return null
    try { return DashboardSSOSchema.parse(JSON.parse(row.value)) } catch { return null }
  }),

  setDashboardSSO: adminProcedure
    .input(DashboardSSOSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      // Redact client secret in stored value for GET — store full value since db is encrypted at rest
      await ctx.db.insert(systemSettings).values({ key: 'dashboard_sso', value: JSON.stringify(input), updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(input), updatedAt: now } })
      return { ok: true }
    }),

  deleteDashboardSSO: adminProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(systemSettings).where(eq(systemSettings.key, 'dashboard_sso'))
    return { ok: true }
  }),
})
