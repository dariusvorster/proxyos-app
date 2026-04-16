import { initTRPC } from '@trpc/server'
import superjson from 'superjson'
import { CaddyClient } from '@proxyos/caddy'
import { getDb } from '@proxyos/db'

export interface Context {
  db: ReturnType<typeof getDb>
  caddy: CaddyClient
}

export function createContext(): Context {
  return {
    db: getDb(),
    caddy: new CaddyClient(),
  }
}

const t = initTRPC.context<Context>().create({ transformer: superjson })

export const router = t.router
export const publicProcedure = t.procedure
