# Analytics

> Analytics provides traffic metrics, latency data, and per-route request history.

## What it does

ProxyOS records traffic metrics from Caddy's access log into the `traffic_metrics` and `access_log` tables. Metrics are aggregated into time buckets and displayed on the route detail page and the global analytics dashboard.

Recorded per request:
- HTTP method, path, status code
- Response latency (ms)
- Bytes out
- Client IP, user agent
- Route ID

Aggregated per bucket:
- Total requests, bytes, errors
- Status code breakdown (2xx, 3xx, 4xx, 5xx)
- Latency sum (used to calculate averages)

## When to use it

Analytics are always-on for all routes. Use the analytics views to:
- Monitor traffic volume and error rates over time
- Identify slow requests (p95 latency)
- Debug problems by reviewing recent requests
- Track SLO compliance (p95 and p99 targets per route)

## How to configure

Analytics requires no configuration. The access log path is `/data/proxyos/access.log` (set by `PROXYOS_ACCESS_LOG` in the Dockerfile).

**Slow request threshold**: Set a per-route threshold in milliseconds. Requests exceeding the threshold are logged to the `slow_requests` table and visible on the route detail page.

**SLO targets**: Configure p95 and p99 latency targets on the route detail page under **SLO Settings**. ProxyOS evaluates compliance daily and records results in `slo_compliance`.

## Troubleshooting

- **No analytics data**: Check that the access log file exists and is being written: `docker compose exec proxyos ls -la /data/proxyos/`
- **Stale metrics**: Metrics are read from the access log by the instrumentation service. If the log rotation is aggressive, old data may be pruned. Check logrotate config in the container.
