import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { router, protectedProcedure, adminProcedure } from '../trpc.js';
import { getDb, federationNodes, nodeEnrollmentTokens, nanoid } from '@proxyos/db';
import { getFederationServer } from '@proxyos/federation/server';

export const nodesRouter = router({
    list: protectedProcedure
        .input(z.object({ siteId: z.string() }))
        .query(async ({ input }) => {
            const db = getDb();
            return db.select().from(federationNodes).where(eq(federationNodes.siteId, input.siteId));
        }),

    listAll: protectedProcedure.query(async () => {
        const db = getDb();
        return db.select().from(federationNodes);
    }),

    createEnrollmentToken: adminProcedure
        .input(z.object({
            siteId: z.string(),
            expiresInHours: z.number().min(1).max(168).default(24),
        }))
        .mutation(async ({ input }) => {
            const db = getDb();
            const rawToken = randomBytes(32).toString('base64url');
            const tokenHash = await bcrypt.hash(rawToken, 12);
            const now = new Date();
            const expiresAt = new Date(now.getTime() + input.expiresInHours * 3600 * 1000);
            await db.insert(nodeEnrollmentTokens).values({
                id: nanoid(),
                tenantId: 'tenant_default',
                siteId: input.siteId,
                tokenHash,
                expiresAt,
                createdAt: now,
            });
            return { token: rawToken, expiresAt: expiresAt.toISOString() };
        }),

    revoke: adminProcedure
        .input(z.object({
            nodeId: z.string(),
            reason: z.string().default('revoked by admin'),
        }))
        .mutation(async ({ input }) => {
            const server = getFederationServer();
            if (server) {
                await server.revoke(input.nodeId, input.reason);
            } else {
                const db = getDb();
                await db
                    .update(federationNodes)
                    .set({ status: 'revoked', revokedAt: new Date() })
                    .where(eq(federationNodes.id, input.nodeId));
            }
        }),

    ping: adminProcedure
        .input(z.object({ nodeId: z.string() }))
        .mutation(async ({ input }) => {
            const server = getFederationServer();
            if (server) await server.ping(input.nodeId);
        }),

    pushConfig: adminProcedure
        .input(z.object({ nodeId: z.string() }))
        .mutation(async ({ input }) => {
            const server = getFederationServer();
            if (server) await server.pushConfig(input.nodeId);
        }),

    connectedIds: protectedProcedure.query(() => {
        const server = getFederationServer();
        return server ? server.connectedNodeIds : [];
    }),
});
