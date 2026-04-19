import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc';
import { discoveredNetworks, networkSyncEvents, systemSettings } from '@proxyos/db';
import { networkDiscoveryService, dockerRequest } from '../automation/network-join';

export const networksRouter = router({
    socketStatus: publicProcedure.query(async () => {
        try {
            await dockerRequest('/var/run/docker.sock', 'GET', '/info');
            return { available: true };
        } catch {
            return { available: false };
        }
    }),

    list: publicProcedure.query(async ({ ctx }) => {
        return ctx.db.select().from(discoveredNetworks).orderBy(discoveredNetworks.status, discoveredNetworks.name);
    }),

    getSettings: publicProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db.select().from(systemSettings);
        const get = (key, def) => rows.find(r => r.key === key)?.value ?? def;
        return {
            enabled: get('docker.auto_discover', '1') === '1',
            socketPath: get('docker.socket_path', '/var/run/docker.sock'),
            rescanIntervalSeconds: parseInt(get('docker.rescan_interval_seconds', '30'), 10),
            excludedNetworks: JSON.parse(get('docker.excluded_networks', '[]')),
            leaveEmptyNetworks: get('docker.leave_empty_networks', '0') === '1',
        };
    }),

    updateSettings: publicProcedure
        .input(z.object({
            enabled: z.boolean().optional(),
            excludedNetworks: z.array(z.string()).optional(),
            leaveEmptyNetworks: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const now = new Date();
            const upsert = (key, value) =>
                ctx.db
                    .insert(systemSettings)
                    .values({ key, value, updatedAt: now })
                    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: now } });
            if (input.enabled !== undefined) await upsert('docker.auto_discover', input.enabled ? '1' : '0');
            if (input.excludedNetworks !== undefined) await upsert('docker.excluded_networks', JSON.stringify(input.excludedNetworks));
            if (input.leaveEmptyNetworks !== undefined) await upsert('docker.leave_empty_networks', input.leaveEmptyNetworks ? '1' : '0');
        }),

    exclude: publicProcedure
        .input(z.object({ networkName: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const now = new Date();
            const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'docker.excluded_networks'));
            const excluded = row[0] ? JSON.parse(row[0].value) : [];
            if (!excluded.includes(input.networkName)) excluded.push(input.networkName);
            await ctx.db
                .insert(systemSettings)
                .values({ key: 'docker.excluded_networks', value: JSON.stringify(excluded), updatedAt: now })
                .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(excluded), updatedAt: now } });
            await networkDiscoveryService.syncOnce().catch(() => {});
        }),

    include: publicProcedure
        .input(z.object({ networkName: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const now = new Date();
            const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'docker.excluded_networks'));
            const excluded = row[0] ? JSON.parse(row[0].value) : [];
            const filtered = excluded.filter(n => n !== input.networkName);
            await ctx.db
                .insert(systemSettings)
                .values({ key: 'docker.excluded_networks', value: JSON.stringify(filtered), updatedAt: now })
                .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(filtered), updatedAt: now } });
            await networkDiscoveryService.syncOnce().catch(() => {});
        }),

    rescanNow: publicProcedure.mutation(async () => {
        await networkDiscoveryService.syncOnce();
    }),

    events: publicProcedure
        .input(z.object({ networkId: z.string().optional(), limit: z.number().default(50) }))
        .query(async ({ ctx, input }) => {
            if (input.networkId) {
                return ctx.db
                    .select()
                    .from(networkSyncEvents)
                    .where(eq(networkSyncEvents.networkId, input.networkId))
                    .orderBy(desc(networkSyncEvents.occurredAt))
                    .limit(input.limit);
            }
            return ctx.db.select().from(networkSyncEvents).orderBy(desc(networkSyncEvents.occurredAt)).limit(input.limit);
        }),

    availableContainers: publicProcedure.query(async () => {
        try {
            const containers = await dockerRequest('/var/run/docker.sock', 'GET', '/containers/json?all=false');
            return containers
                .filter(c => c.State === 'running')
                .map(c => ({
                    id: c.Id.slice(0, 12),
                    name: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12),
                    image: c.Image,
                    networks: Object.entries(c.NetworkSettings?.Networks ?? {}).map(([name, info]) => ({
                        name,
                        ipAddress: info.IPAddress,
                    })),
                }));
        } catch {
            return [];
        }
    }),
});
