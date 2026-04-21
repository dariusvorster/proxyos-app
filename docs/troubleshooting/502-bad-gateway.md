# Problem: 502 Bad Gateway

## Symptoms

- Browser shows **502 Bad Gateway** when accessing a proxied route
- The Caddy error page (or a browser generic page) is shown instead of your service
- The route shows as enabled in the ProxyOS dashboard

## Why this happens

A 502 means Caddy reached the upstream but the upstream connection failed at the network level. This differs from the [holding page](holding-page-shown.md), which is shown for connection refused/timeout on the first attempt.

Common causes:

1. **Upstream service crashed or is not running**
2. **Wrong port** — the service is listening on a different port than configured
3. **Container network isolation** — ProxyOS container cannot reach the upstream container
4. **HTTPS upstream without `https://` prefix** — Caddy dials plain HTTP to an HTTPS-only port and the upstream rejects the connection
5. **Firewall or iptables rule** blocking the connection
6. **Upstream TLS certificate error** — upstream has a self-signed cert and `skipTlsVerify` is not enabled

## Diagnosis

**Test from inside the ProxyOS container:**

```bash
docker compose exec proxyos wget -qO- http://upstream-host:port
# or for HTTPS:
docker compose exec proxyos wget --no-check-certificate -qO- https://upstream-host:port
```

If this fails, the network path is broken. If it succeeds, the problem may be in how the route is configured.

**Check the upstream is listening on the right port:**

```bash
# On the upstream host
ss -tlnp | grep :port
# or
netstat -tlnp | grep :port
```

**Check ProxyOS logs for Caddy errors:**

```bash
docker compose logs proxyos | grep -i "502\|upstream\|dial\|connect"
```

**Check the route's health check status** in the dashboard — repeated failures confirm the upstream is unreachable.

## Fix

### Fix 1: Start or restart the upstream service

The simplest case. If the container or service is down, start it.

```bash
docker start upstream-container
# or
docker compose -f /path/to/upstream/docker-compose.yml up -d
```

### Fix 2: Correct the port

Edit the route in ProxyOS and verify the upstream port matches what the service is actually listening on.

### Fix 3: Fix container network

ProxyOS must share a Docker network with the upstream container.

```bash
# Check ProxyOS networks
docker inspect proxyos --format '{{json .NetworkSettings.Networks}}'

# Join the upstream's network
docker network connect upstream-network proxyos
```

Or use Settings → Docker Networks in the dashboard to manage network joins automatically.

### Fix 4: Add `https://` prefix for HTTPS upstreams

If the upstream only accepts HTTPS connections (Proxmox, PBS, Home Assistant on port 8123 with SSL, etc.), the upstream address must start with `https://`:

```
https://proxmox.lan:8006
```

See [HTTPS Upstream Connection Refused](https-upstream-connection-refused.md).

### Fix 5: Enable skip TLS verify

If the upstream has a self-signed certificate:

1. Edit the route
2. Enable **Skip TLS Verify** (or ProxyOS auto-enables it for port-detected HTTPS upstreams like 8006/8007)

## Prevention

- Enable health checks on routes so you are notified when upstreams go down
- Use container names instead of IP addresses for Docker upstreams — IPs change on container restart
- Document the correct upstream port when setting up a route

## Related

- [Holding Page Shown](holding-page-shown.md)
- [HTTPS Upstream Connection Refused](https-upstream-connection-refused.md)
- [Upstream Health Failed](upstream-health-failed.md)
