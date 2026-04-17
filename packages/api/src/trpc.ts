import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { CaddyClient } from '@proxyos/caddy'
import { getDb } from '@proxyos/db'
import { verifyToken, getTokenFromCookies } from './auth'
import { resolveApiKey } from './apiKeyAuth'

export interface Session {
  userId: string
  role: string
}

export interface Context {
  db: ReturnType<typeof getDb>
  caddy: CaddyClient
  session: Session | null
  tokenScopes: string[] | null
  resHeaders: Headers
}

export async function createContext({ req, resHeaders }: { req: Request; resHeaders: Headers }): Promise<Context> {
  const db = getDb()
  const token = getTokenFromCookies(req.headers.get('cookie'))
  const session = token ? verifyToken(token) : null

  let tokenScopes: string[] | null = null
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer pxos_')) {
    const resolved = await resolveApiKey(db, authHeader.slice(7))
    if (resolved) tokenScopes = resolved.scopes
  }

  return { db, caddy: new CaddyClient(), session, tokenScopes, resHeaders }
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

/** API token with a required scope — used by machine-to-machine integrations (e.g. InfraOS) */
export function tokenScopeProcedure(scope: string) {
  return t.procedure.use(({ ctx, next }) => {
    if (!ctx.tokenScopes?.includes(scope)) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: `API token missing scope: ${scope}` })
    }
    return next({ ctx })
  })
}
