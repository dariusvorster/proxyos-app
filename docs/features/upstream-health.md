# Upstream Health

> Upstream health monitoring tracks whether each route's backend is responding correctly.

## What it does

ProxyOS runs active health checks on a per-route configurable schedule. Results are stored in the `health_checks` table and contribute to a composite health score (`route_health_scores`) that combines uptime percentage, p95 latency, and SLO compliance.

The health score is shown on the routes list as a colored indicator and as a detailed chart on the route detail page.

## When to use it

Health monitoring is enabled by default on all routes. The health score feeds into:
- Dashboard route list (quick visual status)
- Alert rules (trigger notifications when a route goes unhealthy)
- Load balancing (remove unhealthy upstreams from rotation)
- SLO compliance tracking

## How to configure

Health check settings are on the route settings page. See [Health Checks](routes/health-checks.md) for detailed configuration options.

**Alert rules**: Create alert rules in **Settings → Alerts** to send notifications when a route's health score drops below a threshold or when a health check fails for N consecutive intervals. Alert events are stored in `alert_events`.

## Troubleshooting

- Health check red but service accessible: see [Upstream Health Failed](../troubleshooting/upstream-health-failed.md)
- Health score not updating: check that health check is enabled on the route and the interval has elapsed since the last check
