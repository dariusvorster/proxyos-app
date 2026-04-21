# WebSockets

> WebSocket connections are proxied transparently by default — no special configuration required.

## What it does

Caddy's `reverse_proxy` handler transparently upgrades HTTP connections to WebSocket when the client sends an `Upgrade: websocket` header. ProxyOS does not strip or override `Upgrade` or `Connection` headers, so WebSocket connections pass through without modification.

The `websocketEnabled` field on a route is stored in the database and displayed in the UI, but WebSocket proxying in Caddy does not require an explicit flag — it works as long as the headers are not stripped.

## When to use it

WebSocket proxying works automatically for:
- Real-time dashboards (Grafana live, Home Assistant UI)
- Chat or notification services
- Terminal-in-browser tools (Guacamole, ttyd, Wetty)
- Any service using Socket.IO, ws, or native WebSocket

## How to configure

No special configuration is required. Create a route as normal. WebSocket connections are upgraded automatically when the client requests them.

If your upstream requires a specific `Host` header value for WebSocket connections, ensure the **Host** request header on the route passes the correct value (the default `{http.request.host}` is correct for most cases).

## Troubleshooting

- **WebSocket connection fails with 400 or 502**: Check that the upstream is reachable over the same path. Some services use a different path for WebSocket (e.g., `/ws` instead of `/`). The route proxies all paths by default.
- **Connection drops after a timeout**: Some load balancers and CDNs have WebSocket idle timeouts. Caddy itself does not impose a hard WebSocket timeout. Check if Cloudflare or another upstream proxy is closing idle connections.
- **WebSocket works locally but not through ProxyOS**: Verify `trusted_proxies` is set correctly so the upstream receives the real client IP. Some WebSocket servers validate the origin.
