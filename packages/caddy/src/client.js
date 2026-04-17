import { caddyRouteId } from './config';
export class CaddyClient {
    baseUrl;
    serverName;
    constructor(opts = {}) {
        this.baseUrl = opts.baseUrl ?? process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019';
        this.serverName = opts.serverName ?? 'main';
    }
    async health() {
        try {
            const res = await fetch(`${this.baseUrl}/config/`);
            return res.ok;
        }
        catch {
            return false;
        }
    }
    async getConfig() {
        const res = await fetch(`${this.baseUrl}/config/`);
        if (!res.ok)
            throw new Error(`Caddy getConfig failed: ${res.status}`);
        return res.json();
    }
    async loadConfig(config) {
        const res = await this.fetchJson(`${this.baseUrl}/load`, { method: 'POST', body: config });
        if (!res.ok)
            throw new Error(`Caddy loadConfig failed: ${res.status} ${await res.text()}`);
    }
    async hasServer(name) {
        const res = await fetch(`${this.baseUrl}/config/apps/http/servers/${name}`);
        if (res.status === 404)
            return false;
        if (!res.ok)
            return false;
        const body = await res.text();
        return body !== 'null' && body.length > 0;
    }
    async replaceRoutes(serverName, routes) {
        const url = `${this.baseUrl}/config/apps/http/servers/${serverName}/routes`;
        const res = await this.fetchJson(url, { method: 'PATCH', body: routes });
        if (!res.ok)
            throw new Error(`Caddy replaceRoutes failed: ${res.status} ${await res.text()}`);
    }
    async ensureTlsAppExists() {
        const res = await fetch(`${this.baseUrl}/config/apps/tls`);
        const text = await res.text();
        if (!res.ok || text === 'null') {
            const initRes = await this.fetchJson(`${this.baseUrl}/config/apps/tls`, {
                method: 'PUT',
                body: { automation: { policies: [] } },
            });
            if (!initRes.ok) {
                throw new Error(`Caddy TLS app init failed: ${initRes.status} ${await initRes.text()}`);
            }
        }
    }
    async upsertTlsPolicy(policy) {
        const policiesUrl = `${this.baseUrl}/config/apps/tls/automation/policies`;
        const getRes = await fetch(policiesUrl);
        const getText = await getRes.text();
        // Any non-ok response (404, 500 "invalid traversal path", etc.) or null body
        // means the tls app or automation path doesn't exist yet — initialize it via PUT.
        if (!getRes.ok || getText === 'null') {
            const initRes = await this.fetchJson(`${this.baseUrl}/config/apps/tls`, {
                method: 'PUT',
                body: { automation: { policies: [policy] } },
            });
            if (!initRes.ok) {
                throw new Error(`Caddy upsertTlsPolicy init failed: ${initRes.status} ${await initRes.text()}`);
            }
            return;
        }
        // policies array exists — append
        const res = await this.fetchJson(policiesUrl, { method: 'POST', body: policy });
        if (!res.ok)
            throw new Error(`Caddy upsertTlsPolicy failed: ${res.status} ${await res.text()}`);
    }
    async addRoute(route) {
        const url = `${this.baseUrl}/config/apps/http/servers/${this.serverName}/routes`;
        const res = await this.fetchJson(url, { method: 'POST', body: route });
        if (!res.ok) {
            throw new Error(`Caddy addRoute failed: ${res.status} ${await res.text()}`);
        }
    }
    async updateRoute(routeId, route) {
        const url = `${this.baseUrl}/id/${caddyRouteId(routeId)}`;
        const res = await this.fetchJson(url, { method: 'PATCH', body: route });
        if (!res.ok) {
            throw new Error(`Caddy updateRoute failed: ${res.status} ${await res.text()}`);
        }
    }
    async removeRoute(routeId) {
        const url = `${this.baseUrl}/id/${caddyRouteId(routeId)}`;
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) {
            throw new Error(`Caddy removeRoute failed: ${res.status} ${await res.text()}`);
        }
    }
    async setServerErrors(serverName, errorsConfig) {
        const url = `${this.baseUrl}/config/apps/http/servers/${serverName}/errors`;
        const res = await this.fetchJson(url, { method: 'PATCH', body: errorsConfig });
        if (!res.ok) {
            const text = await res.text();
            if (res.status === 404) {
                const putRes = await this.fetchJson(url, { method: 'PUT', body: errorsConfig });
                if (!putRes.ok)
                    throw new Error(`Caddy setServerErrors failed: ${putRes.status} ${await putRes.text()}`);
                return;
            }
            throw new Error(`Caddy setServerErrors failed: ${res.status} ${text}`);
        }
    }
    async setHttpRedirectServer() {
        const url = `${this.baseUrl}/config/apps/http/servers/http_redirect`;
        const config = {
            listen: [':80'],
            routes: [{
                    handle: [{
                            handler: 'static_response',
                            status_code: 308,
                            headers: {
                                Location: ['https://{http.request.host}{http.request.uri}'],
                            },
                        }],
                }],
        };
        const res = await this.fetchJson(url, { method: 'PUT', body: config });
        if (!res.ok)
            throw new Error(`Caddy setHttpRedirectServer failed: ${res.status} ${await res.text()}`);
    }
    async removeHttpRedirectServer() {
        const url = `${this.baseUrl}/config/apps/http/servers/http_redirect`;
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) {
            throw new Error(`Caddy removeHttpRedirectServer failed: ${res.status} ${await res.text()}`);
        }
    }
    async addLayerFourStream(stream) {
        const serverKey = `stream_${stream.id}`;
        const listenAddr = stream.protocol === 'udp'
            ? `udp//:${stream.listenPort}`
            : `:${stream.listenPort}`;
        const body = {
            listen: [listenAddr],
            routes: [{
                    handle: [{
                            handler: 'proxy',
                            upstreams: [{ dial: `${stream.upstreamHost}:${stream.upstreamPort}` }],
                        }],
                }],
        };
        const url = `${this.baseUrl}/config/apps/layer4/servers/${serverKey}`;
        const res = await this.fetchJson(url, { method: 'PUT', body });
        if (!res.ok) {
            throw new Error(`Caddy addLayerFourStream failed: ${res.status} ${await res.text()}`);
        }
    }
    async removeLayerFourStream(streamId) {
        const url = `${this.baseUrl}/config/apps/layer4/servers/stream_${streamId}`;
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) {
            throw new Error(`Caddy removeLayerFourStream failed: ${res.status} ${await res.text()}`);
        }
    }
    fetchJson(url, init) {
        return fetch(url, {
            method: init.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(init.body),
        });
    }
}
