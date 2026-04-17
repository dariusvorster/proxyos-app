import http from 'http';
import { readFile } from 'fs/promises';
import { eq } from 'drizzle-orm';
import { getDb, discoveredNetworks, networkSyncEvents, systemSettings } from '@proxyos/db';

const HOMELAB_EDGE = 'homelab-edge';
const WELL_KNOWN_NAMES = new Set([HOMELAB_EDGE]);

export function dockerRequest(socketPath, method, path, body) {
    return new Promise((resolve, reject) => {
        const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
        const req = http.request({
            socketPath,
            method,
            path,
            headers: bodyStr
                ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
                : undefined,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf-8');
                if ((res.statusCode ?? 0) >= 400) {
                    reject(new Error(`Docker API ${method} ${path} → HTTP ${res.statusCode}: ${text}`));
                    return;
                }
                if (!text) { resolve(null); return; }
                try { resolve(JSON.parse(text)); } catch { resolve(text); }
            });
        });
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('Docker request timed out')); });
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function getSelfContainerId(socketPath) {
    const hostname = (await readFile('/etc/hostname', 'utf-8')).trim();
    const info = await dockerRequest(socketPath, 'GET', `/containers/${hostname}/json`);
    return info.Id;
}

async function loadConfig(defaultSocketPath) {
    const db = getDb();
    const rows = await db.select().from(systemSettings);
    const get = (key, def) => rows.find(r => r.key === key)?.value ?? def;
    return {
        enabled: get('docker.auto_discover', '1') === '1',
        excluded: JSON.parse(get('docker.excluded_networks', '[]')),
        leaveEmpty: get('docker.leave_empty_networks', '0') === '1',
        socketPath: get('docker.socket_path', defaultSocketPath),
    };
}

function filterRelevant(networks, excluded) {
    const SKIP_NAMES = new Set(['bridge', 'host', 'none']);
    const SKIP_DRIVERS = new Set(['null', 'host']);
    return networks.filter(n => {
        if (SKIP_NAMES.has(n.Name)) return false;
        if (SKIP_DRIVERS.has(n.Driver)) return false;
        if (n.Scope === 'swarm') return false;
        if (excluded.includes(n.Name)) return false;
        if (WELL_KNOWN_NAMES.has(n.Name)) return true;
        if (Object.keys(n.Containers ?? {}).length === 0) return false;
        return true;
    });
}

async function createNetwork(socketPath, name, labels) {
    const result = await dockerRequest(socketPath, 'POST', '/networks/create', { Name: name, Driver: 'bridge', Labels: labels });
    return result.Id;
}

async function ensureHomelabEdge(socketPath) {
    const allNetworks = await dockerRequest(socketPath, 'GET', '/networks');
    const existing = allNetworks.find(n => n.Name === HOMELAB_EDGE);
    let networkId;
    if (existing) {
        networkId = existing.Id;
    } else {
        try {
            networkId = await createNetwork(socketPath, HOMELAB_EDGE, { 'proxyos.managed': 'true', 'proxyos.purpose': 'shared-edge' });
            console.log(`[discovery] created well-known network ${HOMELAB_EDGE} (${networkId.slice(0, 12)})`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`[discovery] failed to create ${HOMELAB_EDGE}: ${msg}`);
            return;
        }
    }
    const db = getDb();
    await db.update(discoveredNetworks).set({ isProxyosManaged: true, isWellKnown: true, wellKnownPurpose: 'shared-edge' }).where(eq(discoveredNetworks.id, networkId));
}

function networksAlreadyJoined(networks, selfId) {
    return networks.filter(n =>
        Object.keys(n.Containers ?? {}).some(id => id === selfId || id.startsWith(selfId.slice(0, 12))),
    );
}

async function upsertNetworkRecords(all, desired, current, excluded) {
    const db = getDb();
    const now = new Date();
    for (const net of all) {
        const isExcluded = excluded.includes(net.Name);
        const isJoined = current.has(net.Id) || desired.has(net.Id);
        const status = isExcluded ? 'excluded' : isJoined ? 'joined' : 'available';
        await db
            .insert(discoveredNetworks)
            .values({
                id: net.Id,
                name: net.Name,
                driver: net.Driver,
                scope: net.Scope,
                containerCount: Object.keys(net.Containers ?? {}).length,
                status,
                lastSeenAt: now,
                excludedByUser: isExcluded,
                joinedAt: status === 'joined' ? now : null,
                ...(WELL_KNOWN_NAMES.has(net.Name) ? { isWellKnown: true, isProxyosManaged: true, wellKnownPurpose: 'shared-edge' } : {}),
            })
            .onConflictDoUpdate({
                target: discoveredNetworks.id,
                set: {
                    name: net.Name,
                    containerCount: Object.keys(net.Containers ?? {}).length,
                    status,
                    lastSeenAt: now,
                    excludedByUser: isExcluded,
                    ...(WELL_KNOWN_NAMES.has(net.Name) ? { isWellKnown: true, isProxyosManaged: true, wellKnownPurpose: 'shared-edge' } : {}),
                },
            });
    }
}

async function recordEvent(networkId, eventType, message) {
    const db = getDb();
    await db.insert(networkSyncEvents).values({
        id: crypto.randomUUID(),
        networkId,
        eventType,
        message,
        occurredAt: new Date(),
    });
}

class NetworkDiscoveryService {
    timer = null;
    running = false;
    selfContainerId = null;
    intervalMs;
    defaultSocketPath = '/var/run/docker.sock';

    constructor(intervalMs = 30_000) {
        this.intervalMs = intervalMs;
    }

    get socketMounted() {
        return this.selfContainerId !== null;
    }

    async start() {
        if (this.running) return;
        this.running = true;
        const config = await loadConfig(this.defaultSocketPath);
        if (!config.enabled) { this.running = false; return; }
        try {
            this.selfContainerId = await getSelfContainerId(config.socketPath);
            console.log(`[discovery] identified self as container ${this.selfContainerId.slice(0, 12)}`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`[discovery] cannot identify self container: ${msg}`);
            console.warn('[discovery] auto-network-discovery disabled — mount /var/run/docker.sock to enable');
            this.running = false;
            return;
        }
        await ensureHomelabEdge(config.socketPath).catch(e =>
            console.warn(`[discovery] homelab-edge setup failed: ${e instanceof Error ? e.message : e}`),
        );
        await this.syncOnce().catch(e =>
            console.error(`[discovery] initial sync failed: ${e instanceof Error ? e.message : e}`),
        );
        this.timer = setInterval(() => {
            this.syncOnce().catch(e =>
                console.error(`[discovery] sync failed: ${e instanceof Error ? e.message : e}`),
            );
        }, this.intervalMs);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.running = false;
    }

    async syncOnce() {
        const config = await loadConfig(this.defaultSocketPath);
        if (!config.enabled || !this.selfContainerId) return;
        const allNetworks = await dockerRequest(config.socketPath, 'GET', '/networks');
        const relevant = filterRelevant(allNetworks, config.excluded);
        const currentlyJoined = networksAlreadyJoined(allNetworks, this.selfContainerId);
        const desiredIds = new Set(relevant.map(n => n.Id));
        const currentIds = new Set(currentlyJoined.map(n => n.Id));
        const toJoin = relevant.filter(n => !currentIds.has(n.Id));
        const toLeave = config.leaveEmpty ? currentlyJoined.filter(n => !desiredIds.has(n.Id)) : [];
        for (const net of toJoin) {
            try {
                await dockerRequest(config.socketPath, 'POST', `/networks/${net.Id}/connect`, { Container: this.selfContainerId });
                await recordEvent(net.Id, 'joined', `connected to network ${net.Name}`);
                console.log(`[discovery] joined network ${net.Name} (${net.Id.slice(0, 12)})`);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (msg.includes('already exists') || msg.includes('already attached')) continue;
                await recordEvent(net.Id, 'failed', msg).catch(() => {});
                console.warn(`[discovery] failed to join ${net.Name}: ${msg}`);
            }
        }
        for (const net of toLeave) {
            try {
                await dockerRequest(config.socketPath, 'POST', `/networks/${net.Id}/disconnect`, { Container: this.selfContainerId });
                await recordEvent(net.Id, 'left', `disconnected from network ${net.Name}`);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                await recordEvent(net.Id, 'failed', `leave failed: ${msg}`).catch(() => {});
            }
        }
        await upsertNetworkRecords(allNetworks, desiredIds, currentIds, config.excluded);
    }
}

export const networkDiscoveryService = new NetworkDiscoveryService();
