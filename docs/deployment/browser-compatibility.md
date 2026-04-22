# Browser Compatibility

## Supported browsers

ProxyOS is a homelab admin tool accessed by its operator. The following browsers are tested on the common paths listed below.

| Browser       | Versions tested | Status  |
|---------------|-----------------|---------|
| Chrome / Chromium | Latest 2    | ✅ Supported |
| Edge (Chromium)   | Latest 2    | ✅ Supported |
| Firefox           | Latest 2    | ✅ Supported |
| Safari            | Latest 2    | ✅ Supported |
| Firefox ESR       | Current     | ✅ Supported |

Older versions and non-listed browsers are not tested. They may work but are not supported.

## Tested common paths

| Path                    | Chrome | Edge | Firefox | Safari |
|-------------------------|--------|------|---------|--------|
| Login                   | ✅     | ✅   | ✅      | ✅     |
| Create route (Expose)   | ✅     | ✅   | ✅      | ✅     |
| Edit route              | ✅     | ✅   | ✅      | ✅     |
| Expose service wizard   | ✅     | ✅   | ✅      | ✅     |
| Routes list (paginated) | ✅     | ✅   | ✅      | ✅     |
| Analytics dashboard     | ✅     | ✅   | ✅      | ✅     |
| Settings                | ✅     | ✅   | ✅      | ✅     |

## Known limitations

### iOS Safari — cookies over HTTP

ProxyOS served over plain HTTP (non-TLS) will not persist the session cookie in iOS Safari 17+ due to `SameSite=Lax` enforcement. To fix: serve ProxyOS itself over HTTPS (put it behind a Cloudflare Tunnel or another HTTPS proxy). This does not affect desktop Safari.

### Firefox — self-signed TLS warning

If the ProxyOS admin UI is served via a self-signed certificate, Firefox will show a security warning before allowing access. This is expected Firefox behaviour. Use a trusted certificate (Let's Encrypt via Cloudflare Tunnel, or a local CA).

### No IE or legacy Edge (EdgeHTML)

Internet Explorer and the legacy (pre-Chromium) Edge are not supported. Both are end-of-life and do not support ES2020+ syntax that ProxyOS relies on.

## APIs used

The UI uses only well-supported web platform APIs:

- `fetch` — HTTP requests (tRPC over HTTP)
- `localStorage` / `sessionStorage` — UI preferences only (not auth state)
- CSS Grid and Flexbox — layout
- `ResizeObserver` — not used
- `WebSocket` — not used client-side (federation uses server-side WebSockets)
- Service Workers — not used
- Web Crypto — not used client-side

No polyfills are required for the supported browser matrix above.

## Proxy servers and VPNs

ProxyOS functions normally when the browser accesses it through a corporate proxy or VPN, as long as:

1. The proxy/VPN does not strip `Cookie` headers (required for session auth)
2. The proxy/VPN does not rewrite the `Origin` header (required for CSRF protection)
3. WebSocket connections are not blocked (required for the live traffic view)

If WebSocket connections are blocked, the live traffic page will fall back to polling. All other features continue to work over standard HTTP.

## Non-standard ports

ProxyOS can be served on any port. There are no port-80/443 assumptions in the UI. Browsers may show security warnings for HTTP on non-standard ports — this is a browser restriction, not a ProxyOS limitation.

## IPv6

ProxyOS has no hardcoded IPv4 addresses in its network stack. IPv6 upstream addresses are supported in the upstream field (use bracket notation: `[::1]:8080`). If your Docker network is IPv4-only, Docker's bridge network will handle translation.
