import { caddyRouteId } from './config';
import { request as httpRequest } from 'http';

export class CaddyClient {
    baseUrl;
    serverName;
    constructor(opts = {}) {
        this.baseUrl = opts.baseUrl ?? process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019';
        this.serverName = opts.serverName ?? 'main';
    }
    async health() {
        try {
            const res = await this.doRequest(`${this.baseUrl}/config/`, 'GET');
            return res.ok;
        }
        catch {
            return false;
        }
    }
    async getConfig() {
        const res = await this.doRequest(`${this.baseUrl}/config/`, 'GET');
        if (!res.ok)
            throw new Error(`Caddy getConfig failed: ${res.status}`);
        return JSON.parse(await res.text());
    }
    async loadConfig(config) {
        const res = await this.doRequest(`${this.baseUrl}/load`, 'POST', config);
        if (!res.ok)
            throw new Error(`Caddy loadConfig failed: ${res.status} ${await res.text()}`);
    }
    async hasServer(name) {
        const res = await this.doRequest(`${this.baseUrl}/config/apps/http/servers/${name}`, 'GET');
        if (res.status === 404)
            return false;
        if (!res.ok)
            return false;
        const body = await res.text();
        return body !== 'null' && body.length > 0;
    }
    async replaceRoutes(serverName, routes) {
        const url = `${this.baseUrl}/config/apps/http/servers/${serverName}/routes`;
        const res = await this.doRequest(url, 'PATCH', routes);
        if (!res.ok)
            throw new Error(`Caddy replaceRoutes failed: ${res.status} ${await res.text()}`);
    }
    async ensureTlsAppExists() {
        const res = await this.doRequest(`${this.baseUrl}/config/apps/tls`, 'GET');
        const text = await res.text();
        if (!res.ok || text === 'null') {
            const initRes = await this.doRequest(`${this.baseUrl}/config/apps/tls`, 'PUT', { automation: { policies: [] } });
            if (!initRes.ok) {
                throw new Error(`Caddy TLS app init failed: ${initRes.status} ${await initRes.text()}`);
            }
        }
    }
    async upsertTlsPolicy(policy) {
        const policiesUrl = `${this.baseUrl}/config/apps/tls/automation/policies`;
        const policySubjects = policy.subjects ?? [];
        const getRes = await this.doRequest(policiesUrl, 'GET');
        const getText = await getRes.text();
        if (!getRes.ok || getText === 'null' || getText === '') {
            const initRes = await this.doRequest(`${this.baseUrl}/config/apps/tls`, 'PUT', { automation: { policies: [policy] } });
            if (!initRes.ok) {
                throw new Error(`Caddy upsertTlsPolicy init failed: ${initRes.status} ${await initRes.text()}`);
            }
            return;
        }
        let existing;
        try {
            const parsed = JSON.parse(getText);
            existing = Array.isArray(parsed) ? parsed : [];
        }
        catch {
            existing = [];
        }
        const deduped = [
            ...existing.filter(p => !(p.subjects ?? []).some(s => policySubjects.includes(s))),
            policy,
        ];
        const putRes = await this.doRequest(policiesUrl, 'PATCH', deduped);
        if (!putRes.ok)
            throw new Error(`Caddy upsertTlsPolicy failed: ${putRes.status} ${await putRes.text()}`);
    }
    async addRoute(route) {
        const url = `${this.baseUrl}/config/apps/http/servers/${this.serverName}/routes`;
        const res = await this.doRequest(url, 'POST', route);
        if (!res.ok)
            throw new Error(`Caddy addRoute failed: ${res.status} ${await res.text()}`);
    }
    async updateRoute(routeId, route) {
        const url = `${this.baseUrl}/id/${caddyRouteId(routeId)}`;
        const res = await this.doRequest(url, 'PATCH', route);
        if (!res.ok)
            throw new Error(`Caddy updateRoute failed: ${res.status} ${await res.text()}`);
    }
    async removeRoute(routeId) {
        const url = `${this.baseUrl}/id/${caddyRouteId(routeId)}`;
        const res = await this.doRequest(url, 'DELETE');
        if (!res.ok && res.status !== 404)
            throw new Error(`Caddy removeRoute failed: ${res.status} ${await res.text()}`);
    }
    async setHttpRedirectServer() {
        const url = `${this.baseUrl}/config/apps/http/servers/http_redirect`;
        const config = {
            listen: [':80'],
            routes: [{ handle: [{ handler: 'static_response', status_code: 308, headers: { Location: ['https://{http.request.host}{http.request.uri}'] } }] }],
        };
        const res = await this.doRequest(url, 'PUT', config);
        if (!res.ok)
            throw new Error(`Caddy setHttpRedirectServer failed: ${res.status} ${await res.text()}`);
    }
    async setServerErrors(serverName, errorsConfig) {
        const url = `${this.baseUrl}/config/apps/http/servers/${serverName}/errors`;
        const res = await this.doRequest(url, 'PATCH', errorsConfig);
        if (!res.ok) {
            const text = await res.text();
            if (res.status === 404) {
                const putRes = await this.doRequest(url, 'PUT', errorsConfig);
                if (!putRes.ok)
                    throw new Error(`Caddy setServerErrors failed: ${putRes.status} ${await putRes.text()}`);
                return;
            }
            throw new Error(`Caddy setServerErrors failed: ${res.status} ${text}`);
        }
    }
    async removeHttpRedirectServer() {
        const url = `${this.baseUrl}/config/apps/http/servers/http_redirect`;
        const res = await this.doRequest(url, 'DELETE');
        if (!res.ok && res.status !== 404)
            throw new Error(`Caddy removeHttpRedirectServer failed: ${res.status} ${await res.text()}`);
    }
    async addLayerFourStream(stream) {
        const serverKey = `stream_${stream.id}`;
        const listenAddr = stream.protocol === 'udp' ? `udp//:${stream.listenPort}` : `:${stream.listenPort}`;
        const body = {
            listen: [listenAddr],
            routes: [{ handle: [{ handler: 'proxy', upstreams: [{ dial: `${stream.upstreamHost}:${stream.upstreamPort}` }] }] }],
        };
        const url = `${this.baseUrl}/config/apps/layer4/servers/${serverKey}`;
        const res = await this.doRequest(url, 'PUT', body);
        if (!res.ok)
            throw new Error(`Caddy addLayerFourStream failed: ${res.status} ${await res.text()}`);
    }
    async removeLayerFourStream(streamId) {
        const url = `${this.baseUrl}/config/apps/layer4/servers/stream_${streamId}`;
        const res = await this.doRequest(url, 'DELETE');
        if (!res.ok && res.status !== 404)
            throw new Error(`Caddy removeLayerFourStream failed: ${res.status} ${await res.text()}`);
    }
    doRequest(url, method, body) {
        const parsed = new URL(url);
        const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
        const headers = { 'Origin': this.baseUrl };
        if (bodyStr !== undefined) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
        }
        return new Promise((resolve, reject) => {
            const req = httpRequest({
                hostname: parsed.hostname,
                port: Number(parsed.port) || 80,
                path: parsed.pathname + (parsed.search ?? ''),
                method,
                headers,
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk.toString(); });
                res.on('end', () => {
                    const status = res.statusCode ?? 0;
                    resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(data) });
                });
            });
            req.on('error', reject);
            if (bodyStr !== undefined)
                req.write(bodyStr);
            req.end();
        });
    }
}
