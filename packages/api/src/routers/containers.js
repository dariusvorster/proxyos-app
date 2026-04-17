import { readFile } from 'fs/promises';
import { publicProcedure, router } from '../trpc.js';
import { dockerRequest } from '../automation/network-join.js';

async function getSelfContainerId(socketPath) {
    try {
        const hostname = (await readFile('/etc/hostname', 'utf-8')).trim();
        const info = await dockerRequest(socketPath, 'GET', `/containers/${hostname}/json`);
        return info.Id;
    } catch {
        return null;
    }
}

export const containersRouter = router({
    listDiscoverable: publicProcedure.query(async () => {
        const socketPath = '/var/run/docker.sock';

        const selfId = await getSelfContainerId(socketPath);
        if (!selfId) {
            return {
                socketMounted: false,
                containers: [],
                error: 'Docker socket not mounted or ProxyOS not running in Docker. Mount /var/run/docker.sock to enable container discovery.',
            };
        }

        let networkSummaries;
        try {
            networkSummaries = await dockerRequest(socketPath, 'GET', '/networks');
        } catch (e) {
            return {
                socketMounted: true,
                containers: [],
                error: `Failed to list networks: ${e instanceof Error ? e.message : String(e)}`,
            };
        }

        const inspected = await Promise.allSettled(
            networkSummaries.map((n) => dockerRequest(socketPath, 'GET', `/networks/${n.Id}`)),
        );

        const selfShort = selfId.slice(0, 12);
        const proxyosNetworks = new Map();
        for (const result of inspected) {
            if (result.status !== 'fulfilled') continue;
            const net = result.value;
            const hasProxyos = Object.keys(net.Containers ?? {}).some(
                (id) => id === selfId || id.startsWith(selfShort),
            );
            if (hasProxyos) {
                proxyosNetworks.set(net.Id, net.Name);
            }
        }

        let allContainers;
        try {
            allContainers = await dockerRequest(socketPath, 'GET', '/containers/json?all=false');
        } catch (e) {
            return {
                socketMounted: true,
                containers: [],
                error: `Failed to list containers: ${e instanceof Error ? e.message : String(e)}`,
            };
        }

        const discoverable = [];
        for (const c of allContainers) {
            if (c.Id === selfId || c.Id.startsWith(selfShort)) continue;

            const networkEntries = Object.values(c.NetworkSettings.Networks);
            const sharedNetworks = [];
            const ips = [];
            for (const n of networkEntries) {
                if (!proxyosNetworks.has(n.NetworkID)) continue;
                sharedNetworks.push(proxyosNetworks.get(n.NetworkID));
                if (n.IPAddress) ips.push(n.IPAddress);
            }

            if (sharedNetworks.length === 0) continue;

            const portMap = new Map();
            for (const p of c.Ports ?? []) {
                const key = `${p.PrivatePort}/${p.Type}`;
                if (portMap.has(key)) continue;
                const containerName = c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12);
                const scheme = p.PrivatePort === 443 || p.PrivatePort === 8443 ? 'https' : 'http';
                portMap.set(key, {
                    internalPort: p.PrivatePort,
                    protocol: p.Type,
                    exposedOnHost: p.PublicPort !== undefined,
                    hostPort: p.PublicPort,
                    suggestedUpstream: `${scheme}://${containerName}:${p.PrivatePort}`,
                });
            }

            const containerName = c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12);
            discoverable.push({
                id: c.Id,
                name: containerName,
                image: c.Image,
                state: c.State,
                status: c.Status,
                sharedNetworks,
                ips,
                ports: Array.from(portMap.values()).sort((a, b) => a.internalPort - b.internalPort),
                labels: c.Labels ?? {},
            });
        }

        discoverable.sort((a, b) => a.name.localeCompare(b.name));

        return { socketMounted: true, containers: discoverable };
    }),
});
