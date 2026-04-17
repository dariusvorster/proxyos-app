import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { CaddyClient } from '@proxyos/caddy'
import { getDb } from '@proxyos/db'
import { verifyToken, getTokenFromCookies } from './auth'

export interface Session {
  userId: string
  role: string
}

export interface Context {
  db: ReturnType<typeof getDb>
  caddy: CaddyClient
  session: Session | null
  resHeaders: Headers
}

export function createContext({ req, resHeaders }: { req: Request; resHeaders: Headers }): Context {
  const token = getTokenFromCookies(req.headers.get('cookie'))
  const session = token ? verifyToken(token) : null
  return {
    db: getDb(),
    caddy: new CaddyClient(),
    session,
    resHeaders,
  }
}

const t = initTRPC.context<Context>().create({ transformer: superjson })

export const router = t.router
export const publicProcedure = t.procedure

/** Any authenticated user */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  }
  return next({ ctx: { ...ctx, session: ctx.session } })
})

/** admin or operator — can create/edit/delete resources */
export const operatorProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  }
  if (ctx.session.role !== 'admin' && ctx.session.role !== 'operator') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Operator or admin role required' })
  }
  return next({ ctx: { ...ctx, session: ctx.session } })
})

/** admin only — user management, system settings */
export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  }
  if (ctx.session.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin role required' })
  }
  return next({ ctx: { ...ctx, session: ctx.session } })
})
