import { request as httpRequest } from 'http';

export async function waitForCaddyReady(opts = {}) {
    const baseUrl = opts.baseUrl ?? process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019';
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const intervalMs = opts.intervalMs ?? 250;
    const requestTimeoutMs = opts.requestTimeoutMs ?? 2000;
    const deadline = Date.now() + timeoutMs;
    let attempt = 0;
    let lastError = null;
    while (Date.now() < deadline) {
        attempt++;
        try {
            const ok = await probe(baseUrl, requestTimeoutMs);
            if (ok)
                return;
            lastError = new Error('Caddy admin API returned non-OK status');
        }
        catch (e) {
            lastError = e;
        }
        await sleep(intervalMs);
    }
    const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Caddy admin API not ready after ${timeoutMs}ms (${attempt} attempts): ${errMsg}`);
}
function probe(baseUrl, timeoutMs) {
    const parsed = new URL(`${baseUrl}/config/`);
    return new Promise((resolve, reject) => {
        const req = httpRequest({
            hostname: parsed.hostname,
            port: Number(parsed.port) || 80,
            path: parsed.pathname,
            method: 'GET',
        }, (res) => {
            res.resume();
            resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300);
        });
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('probe timed out')); });
        req.on('error', reject);
        req.end();
    });
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
