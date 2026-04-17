import { getDb, staticUpstreams } from '@proxyos/db';

function parseHost(address) {
    const withScheme = address.includes('://') ? address : `http://${address}`;
    try {
        const u = new URL(withScheme);
        return { scheme: u.protocol.replace(':', ''), host: u.hostname, port: u.port };
    } catch {
        return { scheme: 'http', host: address, port: '' };
    }
}

export async function resolveStaticUpstreams(upstreams) {
    const db = getDb();
    const entries = await db.select().from(staticUpstreams);
    if (entries.length === 0) return upstreams;
    const byName = new Map(entries.map(e => [e.name, e]));
    return upstreams.map(u => {
        const { scheme, host, port } = parseHost(u.address);
        const entry = byName.get(host);
        if (!entry) return u;
        const resolvedPort = port || (entry.defaultPort ? String(entry.defaultPort) : '');
        const resolvedScheme = scheme !== 'http' ? scheme : entry.defaultScheme;
        const resolvedAddress = resolvedPort
            ? `${resolvedScheme}://${entry.host}:${resolvedPort}`
            : `${resolvedScheme}://${entry.host}`;
        return { ...u, address: resolvedAddress };
    });
}

export async function getAllStaticUpstreams() {
    const db = getDb();
    return db.select().from(staticUpstreams);
}
