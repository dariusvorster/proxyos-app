import { readFile } from 'fs/promises';
import { CaddyClient } from './client';
import { buildCaddyRoute, buildHoldingPageHtml } from './config';
export async function bootstrapCaddy(opts) {
    const client = opts.client ?? new CaddyClient({ serverName: opts.serverName ?? 'main' });
    const serverName = opts.serverName ?? 'main';
    if (!(await client.health())) {
        return {
            caddyReachable: false,
            initialConfigLoaded: false,
            routesReplaced: 0,
            error: 'Caddy admin API not reachable',
        };
    }
    let initialConfigLoaded = false;
    if (!(await client.hasServer(serverName))) {
        if (!opts.baseConfigPath) {
            return {
                caddyReachable: true,
                initialConfigLoaded: false,
                routesReplaced: 0,
                error: `Caddy has no server "${serverName}" and no baseConfigPath provided`,
            };
        }
        const raw = await readFile(opts.baseConfigPath, 'utf8');
        await client.loadConfig(JSON.parse(raw));
        initialConfigLoaded = true;
    }
    // Always ensure the TLS app exists — persistent volumes skip loadConfig on restart,
    // so we must initialize the tls app explicitly every time.
    try {
        await client.ensureTlsAppExists();
    }
    catch {
        // Non-fatal: log and continue. upsertTlsPolicy will surface per-route errors.
    }
    const providers = opts.getProviders ? await opts.getProviders() : new Map();
    const build = opts.buildRoute ?? ((r) => buildCaddyRoute(r));
    const routes = await opts.getRoutes();
    const caddyRoutes = routes.filter((r) => r.enabled).map((r) => build(r, providers));
    await client.replaceRoutes(serverName, caddyRoutes);
    try {
        await client.setServerErrors(serverName, {
            routes: [{
                    match: [{ expression: '{http.error.status_code} in [502, 503, 504]' }],
                    handle: [{
                            handler: 'static_response',
                            status_code: 503,
                            body: buildHoldingPageHtml(),
                            headers: { 'Content-Type': ['text/html; charset=utf-8'] },
                        }],
                }],
        });
    }
    catch {
        // Non-fatal: holding page unavailable, Caddy default error pages will show instead.
    }
    return { caddyReachable: true, initialConfigLoaded, routesReplaced: caddyRoutes.length };
}
