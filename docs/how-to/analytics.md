# Analytics

ProxyOS collects traffic data from Caddy's JSON access log and surfaces it in the UI.

---

## Data flow

```
Caddy (request handled)
  --> writes JSON line to PROXYOS_ACCESS_LOG
        --> collector process tails the file
              --> parses and inserts into SQLite
                    --> tRPC analytics queries
                          --> UI dashboard
```

The collector runs inside the container alongside Caddy and the Node.js API. No external services are required.

**Log path:** Set by `PROXYOS_ACCESS_LOG` (default: `/data/proxyos/access.log`).

If the log file is rotated or truncated externally, the collector resumes from the new end of file automatically.

---

## Traffic overview

Navigate to **Analytics** in the sidebar.

The overview shows:
- **Requests/period** — total request count over the selected time range
- **Bandwidth** — inbound and outbound bytes
- **Status code breakdown** — 2xx / 3xx / 4xx / 5xx distribution
- **Error rate** — percentage of non-2xx responses

Use the time range selector (1h, 24h, 7d, 30d) to adjust the window.

---

## Top routes

The **Top Routes** view ranks routes by request count or bandwidth for the selected period. Use it to identify high-traffic services or unexpected spikes on a specific route.

Clicking a route in the list filters all charts to show only traffic for that route.

---

## Bandwidth view

**Analytics** → **Bandwidth** shows inbound and outbound byte transfer per route and per time bucket. Useful for tracking data-heavy services or identifying routes with unexpectedly high egress.

---

## Live heatmap

**Analytics** → **Live** shows a rolling heatmap of requests in real time. Each cell represents a time+route combination. Color intensity indicates request volume.

The live view refreshes automatically and does not require a page reload.

---

## Slow request log

**Analytics** → **Slow Requests** lists individual requests that exceeded a configurable latency threshold.

Each entry shows:
- Timestamp
- Route (domain)
- HTTP method and path
- Response time (ms)
- Status code
- Upstream address

Use this view to identify latency problems in specific upstreams or routes.

**Threshold:** Configurable in **Settings** → **Analytics**. Default is 1000ms.

---

## Alert thresholds

Alerts can be triggered by analytics metrics. Go to **Alerts** → **New Alert** and select a metric source:

| Metric | Description |
|---|---|
| Error rate | Percentage of 4xx/5xx responses over a window |
| Request rate | Requests per minute on a route |
| Latency (p95) | 95th percentile response time |
| Bandwidth | Bytes transferred per window |

Configure:
- **Threshold** — the value that triggers the alert
- **Window** — the time window to evaluate (e.g. 5 minutes)
- **Notification channel** — where to send the alert (see **Settings** → **Notifications**)

Alerts are evaluated continuously against the analytics data already in SQLite. No external metrics pipeline is required.

---

## Prometheus metrics

ProxyOS exposes a Prometheus-compatible `/metrics` endpoint for scraping by external monitoring systems. See [feature reference](../reference/features.md) for details.
