# Health Checks

> Health checks periodically probe the upstream and record whether it is responding correctly.

## What it does

ProxyOS runs active health checks by sending HTTP requests to the upstream at a configurable path and interval. Results are stored in the `health_checks` table and displayed on the route detail page. The last 50 results are shown as a history chart.

Caddy also uses health check results to remove unhealthy upstreams from load balancing rotation when multiple upstreams are configured.

## When to use it

Enable health checks on any route where you want visibility into upstream availability. Particularly useful for:
- Services that occasionally restart (containers, home automation hubs)
- Load-balanced routes where you want automatic failover
- SLO tracking (health data feeds into route health scores)

## How to configure

Health checks are enabled by default (`healthCheckEnabled: true`). Configure on the route settings page:

| Setting | Default | Description |
|---|---|---|
| Enabled | `true` | Toggle health checks on/off |
| Path | `/` | HTTP path to probe |
| Interval | `30` seconds | How often to check |
| Timeout | `5` seconds | Fixed — request must respond within 5 s |
| Expected status codes | (none) | If set, only these codes count as healthy |
| Body regex | (none) | If set, response body must match this regex |
| Max response time (ms) | (none) | If set, slow responses count as unhealthy |

## Troubleshooting

- Health check red but service works in browser: the check path likely returns a redirect or non-200 — see [Upstream Health Failed](../../troubleshooting/upstream-health-failed.md)
- HTTPS upstream health checks: ProxyOS uses the same TLS transport settings as the proxy path, so `https://` upstreams are probed over HTTPS
