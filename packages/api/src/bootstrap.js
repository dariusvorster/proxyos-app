import { buildCaddyRoute } from '@proxyos/caddy';
import { bootstrapCaddy } from '@proxyos/caddy/bootstrap';
import { getDb, routes as routesTable, ssoProviders as ssoTable } from '@proxyos/db';
import { loadAdapters } from './loader';
import { startDriftDetector } from './automation/drift-detector';
import { startHealthChecker } from './automation/health-checker';
import { startTrafficTracker } from './automation/traffic-tracker';
import { startDockerDiscovery } from './automation/docker-discovery';
import { startDdnsUpdater } from './automation/ddns-updater';
import { startScheduledChangesWorker } from './automation/scheduled-changes';
import { startHealthScorer } from './automation/health-scorer';
import { networkDiscoveryService } from './automation/network-join';
import { resolveStaticUpstreams } from './automation/static-upstreams';

export async function bootstrapProxyOs(baseConfigPath) {
    void loadAdapters().catch(err => console.error('[connect] Failed to load adapters:', err));
    startDriftDetector();
    startHealthChecker();
    startTrafficTracker();
    const db2 = getDb();
    startDockerDiscovery(db2);
    startDdnsUpdater(db2);
    startScheduledChangesWorker(db2);
    startHealthScorer(db2);
    // Join Docker networks before Caddy bootstrap so container-name upstreams resolve
    try {
        await networkDiscoveryService.start();
    } catch (e) {
        console.warn('[proxyos] network discovery unavailable:', e instanceof Error ? e.message : e);
    }
    const db = getDb();
    return bootstrapCaddy({
        baseConfigPath,
        buildRoute: (route, providerMap) => buildCaddyRoute(route, { ssoProvider: resolveProvider(route, providerMap) }),
        getProviders: async () => {
            const rows = await db.select().from(ssoTable);
            const map = new Map();
            for (const row of rows) {
                map.set(row.id, {
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
                });
            }
            return map;
        },
        getRoutes: async () => {
            const rows = await db.select().from(routesTable);
            const routes = await Promise.all(rows.map(async (row) => {
                const rawUpstreams = JSON.parse(row.upstreams);
                const upstreams = await resolveStaticUpstreams(rawUpstreams).catch(() => rawUpstreams);
                return ({
                id: row.id,
                name: row.name,
                domain: row.domain,
                enabled: row.enabled,
                upstreamType: row.upstreamType,
                upstreams,
                tlsMode: row.tlsMode,
                tlsDnsProviderId: row.tlsDnsProviderId,
                ssoEnabled: row.ssoEnabled,
                ssoProviderId: row.ssoProviderId,
                healthCheckEnabled: row.healthCheckEnabled,
                healthCheckPath: row.healthCheckPath,
                healthCheckInterval: row.healthCheckInterval,
                compressionEnabled: row.compressionEnabled,
                websocketEnabled: row.websocketEnabled,
                http2Enabled: row.http2Enabled,
                http3Enabled: row.http3Enabled,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                });
            }));
            return routes;
        },
    });
}
function resolveProvider(route, map) {
    if (!route.ssoEnabled || !route.ssoProviderId)
        return null;
    return map.get(route.ssoProviderId) ?? null;
}
