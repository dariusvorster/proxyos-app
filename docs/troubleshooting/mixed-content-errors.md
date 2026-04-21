# Problem: Mixed Content Errors

## Symptoms

- Your service loads but assets (images, JS, CSS) fail with mixed content errors in the browser console
- Console shows: `Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure resource 'http://...'`
- Some buttons or API calls fail silently
- The browser shows a broken padlock icon

## Why this happens

Mixed content errors occur when the browser loads an HTTPS page that then tries to load sub-resources over HTTP. The root cause in a ProxyOS setup is usually one of two things:

**Cause 1: The upstream service generates absolute `http://` URLs**

Some applications (older WordPress, Grafana, etc.) generate hardcoded `http://` URLs in their HTML when they don't know they are being proxied over HTTPS. The browser receives the HTTPS page from Caddy but the embedded URLs still say `http://`.

**Cause 2: `trusted_proxies` is not covering the proxy in front of ProxyOS**

If ProxyOS is behind Cloudflare (or another proxy), the upstream request arrives at ProxyOS with the original HTTPS connection information in `X-Forwarded-Proto: https`. Caddy forwards this to the upstream only if it trusts the proxy. If the proxy's IP is not in `trusted_proxies`, Caddy does not trust the `X-Forwarded-Proto` header and the upstream sees `http://` as the protocol.

ProxyOS includes all Cloudflare IPs, RFC1918 ranges, and Tailscale CGNAT in its default `trusted_proxies` configuration. If your proxy is not covered by these ranges, the header is ignored.

## Diagnosis

**Check what `X-Forwarded-Proto` your upstream receives:**

```bash
# Deploy a simple echo service to inspect headers
docker run -d --name echo -p 9999:80 mendhak/http-https-echo
# Then route it through ProxyOS and check the response body
curl https://your-route-domain/
```

Look for `x-forwarded-proto` in the response. If it says `http` when you expected `https`, `trusted_proxies` is not working.

**Check container logs for proxy IP:**

```bash
docker compose logs proxyos | grep "remote_ip\|trusted"
```

## Fix

### Fix 1: Tell the upstream it's behind HTTPS

Most applications have a setting for this:

- **WordPress**: Set `WORDPRESS_CONFIG_EXTRA` with `define('FORCE_SSL_ADMIN', true);` and configure the site URL to `https://`
- **Grafana**: Set `GF_SERVER_ROOT_URL=https://your-domain`
- **Generic**: Set `X-Forwarded-Proto: https` as a forced request header on the route in ProxyOS (Headers tab)

In ProxyOS, you can force the header on the route:

1. Edit the route
2. Go to the **Headers** tab
3. Add a request header: `X-Forwarded-Proto` = `https`

### Fix 2: Verify trusted_proxies covers your proxy

ProxyOS's `trusted_proxies` includes Cloudflare, RFC1918, and Tailscale ranges by default. These are configured at the Caddy server level.

If you are behind a proxy not in those ranges, you currently need to redeploy with a patched config. See [Trusted Proxies](../deployment/trusted-proxies.md) for the full list of covered ranges and notes on customization.

### Fix 3: Force HTTPS on the route

Enable **Force SSL** on the route in ProxyOS. This adds a redirect from HTTP to HTTPS at the Caddy level. It does not fix the upstream generating `http://` URLs but prevents plain HTTP access to the route.

## Prevention

- When setting up a new service, verify it generates correct absolute URLs before putting it behind ProxyOS
- Use the **Headers** tab to inject `X-Forwarded-Proto: https` as a safety measure for applications that need it
- Ensure any proxy in front of ProxyOS has its IPs covered by `trusted_proxies`

## Related

- [Trusted Proxies](../deployment/trusted-proxies.md)
- [Behind Cloudflare Tunnel](../deployment/behind-cloudflare-tunnel.md)
- [Behind Another Proxy](../deployment/behind-another-proxy.md)
