import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { CaddyClient } from '@proxyos/caddy';
import { getDb } from '@proxyos/db';
export function createContext() {
    return {
        db: getDb(),
        caddy: new CaddyClient(),
    };
}
const t = initTRPC.context().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure;
export const operatorProcedure = t.procedure;
export const adminProcedure = t.procedure;
export function tokenScopeProcedure(_scope) { return t.procedure; }
