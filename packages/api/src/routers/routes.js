import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { buildCaddyRoute, buildTlsPolicy } from '@proxyos/caddy';
import { dnsProviders, nanoid, routes, ssoProviders, auditLog, systemLog } from '@proxyos/db';
import { resolveStaticUpstreams } from '../automation/static-upstreams.js';
import { buildLogEntry } from './systemLog';
import { publicProcedure, router } from '../trpc';
const upstreamSchema = z.object({
    address: z.string().min(1),
});
const createInput = z.object({
    name: z.string().min(1).max(100),
    domain: z.string().min(1).max(253),
    upstreams: z.array(upstreamSchema).min(1),
    tlsMode: z.enum(['auto', 'dns', 'internal', 'custom', 'off']).default('auto'),
    ssoEnabled: z.boolean().default(false),
    ssoProviderId: z.string().nullable().default(null),
    tlsDnsProviderId: z.string().nullable().default(null),
    compressionEnabled: z.boolean().default(true),
    healthCheckEnabled: z.boolean().default(true),
    healthCheckPath: z.string().default('/'),
});
const exposeInput = z.object({
    name: z.string().min(1).max(100),
    upstreamUrl: z.string().min(1),
    domain: z.string().min(1).max(253),
    tlsMode: z.enum(['auto', 'dns', 'internal', 'custom', 'off']).default('auto'),
    tlsDnsProviderId: z.string().nullable().default(null),
    ssoEnabled: z.boolean().default(false),
    ssoProviderId: z.string().nullable().default(null),
});
function rowToRoute(row) {
    return {
        id: row.id,
        name: row.name,
        domain: row.domain,
        enabled: row.enabled,
        upstreamType: row.upstreamType,
        upstreams: JSON.parse(row.upstreams),
        tlsMode: row.tlsMode,
        tlsDnsProviderId: row.tlsDnsProviderId,
        ssoEnabled: row.ssoEnabled,
        ssoProviderId: row.ssoProviderId,
        rateLimit: row.rateLimit ? JSON.parse(row.rateLimit) : null,
        ipAllowlist: row.ipAllowlist ? JSON.parse(row.ipAllowlist) : null,
        basicAuth: row.basicAuth ? JSON.parse(row.basicAuth) : null,
        headers: row.headers ? JSON.parse(row.headers) : null,
        healthCheckEnabled: row.healthCheckEnabled,
        healthCheckPath: row.healthCheckPath,
        healthCheckInterval: row.healthCheckInterval,
        compressionEnabled: row.compressionEnabled,
        websocketEnabled: row.websocketEnabled,
        http2Enabled: row.http2Enabled,
        http3Enabled: row.http3Enabled,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
async function syncRouteToCaddy(ctx, route) {
    let ssoProvider = null;
    if (route.ssoEnabled && route.ssoProviderId) {
        const row = await ctx.db.select().from(ssoProviders).where(eq(ssoProviders.id, route.ssoProviderId)).get();
        if (row)
            ssoProvider = rowToSSOProvider(row);
    }
    let dnsProvider = null;
    if (route.tlsMode === 'dns' && route.tlsDnsProviderId) {
        const row = await ctx.db.select().from(dnsProviders).where(eq(dnsProviders.id, route.tlsDnsProviderId)).get();
        if (row)
            dnsProvider = rowToDnsProvider(row);
    }
    const resolvedUpstreams = await resolveStaticUpstreams(route.upstreams).catch(() => route.upstreams);
    const resolvedRoute = resolvedUpstreams !== route.upstreams ? { ...route, upstreams: resolvedUpstreams } : route;
    const tlsPolicy = buildTlsPolicy(resolvedRoute, dnsProvider);
    if (tlsPolicy)
        await ctx.caddy.upsertTlsPolicy(tlsPolicy);
    await ctx.caddy.updateRoute(route.id, buildCaddyRoute(resolvedRoute, { ssoProvider, dnsProvider }));
}
function rowToDnsProvider(row) {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        credentials: JSON.parse(row.credentials),
        enabled: row.enabled,
        createdAt: row.createdAt,
    };
}
function rowToSSOProvider(row) {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        forwardAuthUrl: row.forwardAuthUrl,
        authResponseHeaders: JSON.parse(row.authResponseHeaders),
        trustedIPs: JSON.parse(row.trustedIPs),
        enabled: row.enabled,
        lastTestedAt: row.lastTestedAt,
        testStatus: row.testStatus,
        createdAt: row.createdAt,
    };
}
export const routesRouter = router({
    list: publicProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db.select().from(routes);
        return rows.map(rowToRoute);
    }),
    create: publicProcedure.input(createInput).mutation(async ({ ctx, input }) => {
        const existing = await ctx.db.select().from(routes).where(eq(routes.domain, input.domain)).get();
        if (existing) {
            throw new TRPCError({ code: 'CONFLICT', message: `${input.domain} already has a route` });
        }
        let ssoProvider = null;
        if (input.ssoEnabled) {
            if (!input.ssoProviderId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'ssoProviderId required when ssoEnabled' });
            }
            const row = await ctx.db.select().from(ssoProviders).where(eq(ssoProviders.id, input.ssoProviderId)).get();
            if (!row)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'SSO provider not found' });
            ssoProvider = rowToSSOProvider(row);
        }
        let dnsProvider = null;
        if (input.tlsMode === 'dns') {
            if (!input.tlsDnsProviderId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'tlsDnsProviderId required when tlsMode=dns' });
            }
            const row = await ctx.db.select().from(dnsProviders).where(eq(dnsProviders.id, input.tlsDnsProviderId)).get();
            if (!row)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'DNS provider not found' });
            dnsProvider = rowToDnsProvider(row);
        }
        const now = new Date();
        const id = nanoid();
        const route = {
            id,
            name: input.name,
            domain: input.domain,
            enabled: true,
            upstreamType: 'http',
            upstreams: input.upstreams,
            tlsMode: input.tlsMode,
            tlsDnsProviderId: input.tlsDnsProviderId ?? null,
            ssoEnabled: input.ssoEnabled,
            ssoProviderId: input.ssoProviderId,
            healthCheckEnabled: input.healthCheckEnabled,
            healthCheckPath: input.healthCheckPath,
            healthCheckInterval: 30,
            compressionEnabled: input.compressionEnabled,
            websocketEnabled: true,
            http2Enabled: true,
            http3Enabled: true,
            createdAt: now,
            updatedAt: now,
        };
        await ctx.db.insert(routes).values({
            id,
            name: route.name,
            domain: route.domain,
            enabled: true,
            upstreamType: route.upstreamType,
            upstreams: JSON.stringify(route.upstreams),
            tlsMode: route.tlsMode,
            tlsDnsProviderId: route.tlsDnsProviderId,
            ssoEnabled: route.ssoEnabled,
            ssoProviderId: route.ssoProviderId,
            healthCheckEnabled: route.healthCheckEnabled ?? true,
            healthCheckPath: route.healthCheckPath ?? '/',
            healthCheckInterval: route.healthCheckInterval ?? 30,
            compressionEnabled: route.compressionEnabled ?? true,
            websocketEnabled: true,
            http2Enabled: true,
            http3Enabled: true,
            createdAt: now,
            updatedAt: now,
        });
        try {
            const tlsPolicy = buildTlsPolicy(route, dnsProvider);
            if (tlsPolicy)
                await ctx.caddy.upsertTlsPolicy(tlsPolicy);
            await ctx.caddy.addRoute(buildCaddyRoute(route, { ssoProvider, dnsProvider }));
        }
        catch (err) {
            await ctx.db.delete(routes).where(eq(routes.id, id));
            await ctx.db.insert(systemLog).values(buildLogEntry('error', 'caddy', `Failed to push route "${input.domain}" to Caddy`, {
                domain: input.domain,
                tlsMode: input.tlsMode,
                upstreams: input.upstreams,
                error: err.message,
                stack: err.stack,
            })).catch(() => { });
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to push route to Caddy: ${err.message}`,
            });
        }
        await ctx.db.insert(auditLog).values({
            id: nanoid(),
            action: 'route.create',
            resourceType: 'route',
            resourceId: id,
            resourceName: route.domain,
            actor: 'user',
            detail: JSON.stringify({ upstreams: route.upstreams, tlsMode: route.tlsMode, ssoEnabled: route.ssoEnabled }),
            createdAt: now,
        });
        return route;
    }),
    expose: publicProcedure.input(exposeInput).mutation(async ({ ctx, input }) => {
        if (!(await ctx.caddy.health())) {
            throw new TRPCError({
                code: 'SERVICE_UNAVAILABLE',
                message: 'Caddy admin API is not reachable. Start Caddy before exposing a service.',
            });
        }
        const existing = await ctx.db.select().from(routes).where(eq(routes.domain, input.domain)).get();
        if (existing) {
            throw new TRPCError({ code: 'CONFLICT', message: `${input.domain} already has a route` });
        }
        let ssoProvider = null;
        if (input.ssoEnabled) {
            if (!input.ssoProviderId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'ssoProviderId required when ssoEnabled' });
            }
            const row = await ctx.db.select().from(ssoProviders).where(eq(ssoProviders.id, input.ssoProviderId)).get();
            if (!row)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'SSO provider not found' });
            ssoProvider = rowToSSOProvider(row);
        }
        let dnsProvider = null;
        if (input.tlsMode === 'dns') {
            if (!input.tlsDnsProviderId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'tlsDnsProviderId required when tlsMode=dns' });
            }
            const row = await ctx.db.select().from(dnsProviders).where(eq(dnsProviders.id, input.tlsDnsProviderId)).get();
            if (!row)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'DNS provider not found' });
            dnsProvider = rowToDnsProvider(row);
        }
        const now = new Date();
        const id = nanoid();
        const upstreamAddress = input.upstreamUrl.replace(/^https?:\/\//, '');
        const route = {
            id,
            name: input.name,
            domain: input.domain,
            enabled: true,
            upstreamType: 'http',
            upstreams: [{ address: upstreamAddress }],
            tlsMode: input.tlsMode,
            tlsDnsProviderId: input.tlsDnsProviderId ?? null,
            ssoEnabled: input.ssoEnabled,
            ssoProviderId: input.ssoProviderId,
            healthCheckEnabled: true,
            healthCheckPath: '/',
            healthCheckInterval: 30,
            compressionEnabled: true,
            websocketEnabled: true,
            http2Enabled: true,
            http3Enabled: true,
            createdAt: now,
            updatedAt: now,
        };
        await ctx.db.insert(routes).values({
            id,
            name: route.name,
            domain: route.domain,
            enabled: true,
            upstreamType: route.upstreamType,
            upstreams: JSON.stringify(route.upstreams),
            tlsMode: route.tlsMode,
            tlsDnsProviderId: route.tlsDnsProviderId,
            ssoEnabled: route.ssoEnabled,
            ssoProviderId: route.ssoProviderId,
            healthCheckEnabled: true,
            healthCheckPath: '/',
            healthCheckInterval: 30,
            compressionEnabled: true,
            websocketEnabled: true,
            http2Enabled: true,
            http3Enabled: true,
            createdAt: now,
            updatedAt: now,
        });
        try {
            const tlsPolicy = buildTlsPolicy(route, dnsProvider);
            if (tlsPolicy)
                await ctx.caddy.upsertTlsPolicy(tlsPolicy);
            await ctx.caddy.addRoute(buildCaddyRoute(route, { ssoProvider, dnsProvider }));
        }
        catch (err) {
            await ctx.db.delete(routes).where(eq(routes.id, id));
            await ctx.db.insert(systemLog).values(buildLogEntry('error', 'caddy', `Failed to expose "${input.domain}" in Caddy`, {
                domain: input.domain,
                tlsMode: input.tlsMode,
                upstreamUrl: input.upstreamUrl,
                error: err.message,
                stack: err.stack,
            })).catch(() => { });
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to push route to Caddy: ${err.message}`,
            });
        }
        await ctx.db.insert(auditLog).values({
            id: nanoid(),
            action: 'route.expose',
            resourceType: 'route',
            resourceId: id,
            resourceName: route.domain,
            actor: 'user',
            detail: JSON.stringify({ upstreamUrl: input.upstreamUrl, ssoEnabled: input.ssoEnabled, tlsMode: input.tlsMode }),
            createdAt: now,
        });
        return {
            success: true,
            routeId: id,
            domain: route.domain,
            url: route.tlsMode === 'off' ? `http://${route.domain}` : `https://${route.domain}`,
            ssoEnabled: route.ssoEnabled,
            certStatus: route.tlsMode === 'off' ? 'none' : 'provisioning',
        };
    }),
    get: publicProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
        const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get();
        if (!row)
            throw new TRPCError({ code: 'NOT_FOUND' });
        return rowToRoute(row);
    }),
    update: publicProcedure
        .input(z.object({
        id: z.string(),
        patch: z.object({
            name: z.string().min(1).max(100).optional(),
            upstreams: z.array(upstreamSchema).min(1).optional(),
            tlsMode: z.enum(['auto', 'dns', 'internal', 'custom', 'off']).optional(),
            tlsDnsProviderId: z.string().nullable().optional(),
            ssoEnabled: z.boolean().optional(),
            ssoProviderId: z.string().nullable().optional(),
            rateLimit: z.object({ requests: z.number().int().min(1), window: z.string() }).nullable().optional(),
            ipAllowlist: z.array(z.string()).nullable().optional(),
            basicAuth: z.object({ username: z.string(), password: z.string() }).nullable().optional(),
            compressionEnabled: z.boolean().optional(),
            websocketEnabled: z.boolean().optional(),
            http2Enabled: z.boolean().optional(),
            http3Enabled: z.boolean().optional(),
            healthCheckEnabled: z.boolean().optional(),
            healthCheckPath: z.string().optional(),
            healthCheckInterval: z.number().int().min(1).optional(),
        }),
    }))
        .mutation(async ({ ctx, input }) => {
        const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get();
        if (!row)
            throw new TRPCError({ code: 'NOT_FOUND' });
        const update = { updatedAt: new Date() };
        const p = input.patch;
        if (p.name !== undefined)
            update.name = p.name;
        if (p.upstreams !== undefined)
            update.upstreams = JSON.stringify(p.upstreams);
        if (p.tlsMode !== undefined)
            update.tlsMode = p.tlsMode;
        if (p.tlsDnsProviderId !== undefined)
            update.tlsDnsProviderId = p.tlsDnsProviderId;
        if (p.ssoEnabled !== undefined)
            update.ssoEnabled = p.ssoEnabled;
        if (p.ssoProviderId !== undefined)
            update.ssoProviderId = p.ssoProviderId;
        if (p.rateLimit !== undefined)
            update.rateLimit = p.rateLimit ? JSON.stringify(p.rateLimit) : null;
        if (p.ipAllowlist !== undefined)
            update.ipAllowlist = p.ipAllowlist ? JSON.stringify(p.ipAllowlist) : null;
        if (p.basicAuth !== undefined)
            update.basicAuth = p.basicAuth ? JSON.stringify(p.basicAuth) : null;
        if (p.compressionEnabled !== undefined)
            update.compressionEnabled = p.compressionEnabled;
        if (p.websocketEnabled !== undefined)
            update.websocketEnabled = p.websocketEnabled;
        if (p.http2Enabled !== undefined)
            update.http2Enabled = p.http2Enabled;
        if (p.http3Enabled !== undefined)
            update.http3Enabled = p.http3Enabled;
        if (p.healthCheckEnabled !== undefined)
            update.healthCheckEnabled = p.healthCheckEnabled;
        if (p.healthCheckPath !== undefined)
            update.healthCheckPath = p.healthCheckPath;
        if (p.healthCheckInterval !== undefined)
            update.healthCheckInterval = p.healthCheckInterval;
        await ctx.db.update(routes).set(update).where(eq(routes.id, input.id));
        const updated = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get();
        const route = rowToRoute(updated);
        try {
            await syncRouteToCaddy(ctx, route);
        }
        catch (err) {
            await ctx.db.insert(systemLog).values(buildLogEntry('error', 'caddy', `Failed to update route "${route.domain}" in Caddy`, {
                domain: route.domain,
                tlsMode: route.tlsMode,
                patch: input.patch,
                error: err.message,
                stack: err.stack,
            })).catch(() => { });
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to update Caddy: ${err.message}` });
        }
        await ctx.db.insert(auditLog).values({
            id: nanoid(),
            action: 'route.update',
            resourceType: 'route',
            resourceId: input.id,
            resourceName: route.domain,
            actor: 'user',
            detail: JSON.stringify(p),
            createdAt: new Date(),
        });
        return route;
    }),
    toggle: publicProcedure
        .input(z.object({ id: z.string(), enabled: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
        const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get();
        if (!row)
            throw new TRPCError({ code: 'NOT_FOUND' });
        await ctx.db.update(routes).set({ enabled: input.enabled, updatedAt: new Date() }).where(eq(routes.id, input.id));
        if (input.enabled) {
            const updated = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get();
            await syncRouteToCaddy(ctx, rowToRoute(updated));
        }
        else {
            await ctx.caddy.removeRoute(input.id);
        }
        await ctx.db.insert(auditLog).values({
            id: nanoid(),
            action: input.enabled ? 'route.enable' : 'route.disable',
            resourceType: 'route',
            resourceId: input.id,
            resourceName: row.domain,
            actor: 'user',
            createdAt: new Date(),
        });
        return { success: true };
    }),
    test: publicProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
        const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get();
        if (!row)
            throw new TRPCError({ code: 'NOT_FOUND' });
        const upstreams = JSON.parse(row.upstreams);
        const results = [];
        for (const u of upstreams) {
            const url = u.address.startsWith('http') ? u.address : `http://${u.address}`;
            const start = performance.now();
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            try {
                const res = await fetch(url + (row.healthCheckPath || '/'), { signal: controller.signal, redirect: 'manual' });
                results.push({ address: u.address, ok: res.status < 500, status: res.status, latencyMs: Math.round(performance.now() - start) });
            }
            catch (err) {
                results.push({ address: u.address, ok: false, latencyMs: Math.round(performance.now() - start), error: err.message });
            }
            finally {
                clearTimeout(timer);
            }
        }
        return { results };
    }),
    delete: publicProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
        const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get();
        if (!row)
            throw new TRPCError({ code: 'NOT_FOUND' });
        await ctx.caddy.removeRoute(input.id);
        await ctx.db.delete(routes).where(eq(routes.id, input.id));
        await ctx.db.insert(auditLog).values({
            id: nanoid(),
            action: 'route.delete',
            resourceType: 'route',
            resourceId: input.id,
            resourceName: row.domain,
            actor: 'user',
            createdAt: new Date(),
        });
        return { success: true };
    }),
});
