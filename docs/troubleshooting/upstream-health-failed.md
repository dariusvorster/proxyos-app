# Problem: Upstream Health Check Failed (Red) But Service Works

## Symptoms

- The route detail page shows a red health check status
- The health check history shows repeated failures
- But the service responds correctly when you access it through the browser
- Health check error might say `unexpected status code` or `connection refused`

## Why this happens

ProxyOS runs active health checks by periodically sending HTTP requests to the upstream at the configured path (default: `/`). A health check fails when:

1. **The health check path returns a non-2xx status code** — Many services return 301, 302, or 404 for `/`. A redirect counts as a failure if the health check doesn't follow it.

2. **The upstream rejects health checks from the ProxyOS internal IP** — Some services (VPNs, auth-protected services) block requests that don't have the right headers or come from unexpected IPs.

3. **Health check path is wrong** — The service's health endpoint is not at `/`. For example, many services use `/health`, `/healthz`, or `/api/health`.

4. **HTTPS upstream + health check dialing plain HTTP** — If health checks are not using the TLS transport, they fail even though the proxy path (which does use TLS) works.

5. **Body regex mismatch** — If a health check body regex is configured and the response body doesn't match, the check fails even with a 200 status.

## Diagnosis

**Manually test the health check path:**

```bash
# From inside the ProxyOS container
docker compose exec proxyos wget -qO- http://upstream-host:port/health-path
```

Check what status code and body you get.

**Review the health check configuration:**

In the dashboard, go to the route → Settings tab → Health Check section. Note:
- Health check path
- Expected status codes (if configured)
- Body regex (if configured)

**Look at the health check history:**

The route detail page shows the last 50 health check results with status codes and error messages.

## Fix

### Fix 1: Set the correct health check path

Edit the route and change the health check path from `/` to the service's actual health endpoint:

| Service | Typical health path |
|---|---|
| Generic | `/health` or `/healthz` |
| ProxyOS itself | `/api/health` |
| Grafana | `/api/health` |
| Portainer | `/api/status` |
| Most services | Check their documentation |

### Fix 2: Accept the redirect

If the service redirects `/` to `/dashboard` or `/login`, you have two options:
- Set the health check path to a path that returns 200 directly
- Or disable health checks for this route if the redirect is expected and harmless

### Fix 3: Disable health checks

If the upstream service doesn't have a suitable health endpoint and you don't need the monitoring:

1. Edit the route
2. Uncheck **Enable health check**

The route will still proxy correctly; you just won't get health status in the dashboard.

### Fix 4: Configure allowed status codes

If the service intentionally returns a non-200 code on its health path (e.g., 204), configure the allowed status codes in the health check settings to include that code.

### Fix 5: Remove body regex

If a body regex is configured but the response body format changed, remove or update the regex.

## Prevention

- When creating a route, verify the health check path returns 200 from inside the container
- For authenticated services, use a path that doesn't require authentication (e.g., a `/ping` endpoint)
- Don't configure body regex unless you have a stable, machine-readable health response

## Related

- [Analytics](../features/analytics.md)
- [Upstream Health](../features/upstream-health.md)
- [502 Bad Gateway](502-bad-gateway.md)
