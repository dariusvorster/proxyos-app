# Changelog

---

## v0.1.0 — Stability Initiative (2026-04-22)

Engineering hardening pass across 6 phases. No new user-facing features — this release makes existing features reliable.

### Silent failure elimination (Phase 2)
- All route mutations (`create`, `update`, `delete`, `expose`, `archive`, `unarchive`) now wrap DB writes and Caddy pushes atomically — a Caddy failure rolls back the DB write
- Validation errors surface to the UI as structured errors instead of being swallowed
- Federation sync failures log a clear error with recovery steps; exponential backoff prevents spin loops

### Save integrity (Phase 3)
- All mutations return the updated route record
- UI only clears edit mode after Caddy confirms the pushed route (`verifyRoute`)
- Optimistic UI rollback on error for all mutations
- All form fields reset to fresh server data after save

### Container rebuild resilience (Phase 4)
- Caddy reverse_proxy transports now include Docker DNS resolver (`127.0.0.11`) and `dial_timeout: 3s` — upstream names survive container rebuilds
- SQLite WAL checkpoints every 5 minutes; integrity check at startup
- Clear "Agent identity lost" error with volume restore instructions
- Rebuild smoke test script (`scripts/rebuild-smoke-test.sh`)

### Test coverage (Phase 5)
- Property-based tests for `buildCaddyRoute` and `applyDockerDns` (fast-check, 6 properties)
- Migration integrity tests (in-memory SQLite, 7 tests)
- Caddy round-trip integration tests (skip without live Caddy)
- tRPC route mutation tests (5 tests: happy path, bad input, unauthorized, forbidden, conflict)
- Playwright E2E test for route management flow
- CI workflow: tests + typecheck + shadow guard on every PR

### Edge cases and cleanup (Phase 6)
- Upstream failure probe: "Test Connection" button shows distinct error per failure mode (DNS, refused, timeout, TLS, 5xx, 4xx, slow)
- Routes list paginated server-side (50 routes/page, Prev/Next, live count)
- Caddy admin retry upgraded from linear to exponential backoff (capped 10s)
- Removed dormant "Trust Upstream Headers" UI toggle (Caddy builder never consumed it)
- Browser compatibility documented (`docs/deployment/browser-compatibility.md`)

---

## Phase 6 (current)

### Docker network auto-discovery
- ProxyOS now scans the Docker socket for networks and allows joining them from the dashboard (Settings → Docker Networks)
- `discovered_networks` and `network_sync_events` tables added
- Static upstream definitions added (`static_upstreams` table) for non-Docker backends

### Container scanner improvements
- Scanner uses Docker labels (`proxyos.domain`, `proxyos.port`, `proxyos.scheme`) for high-confidence route suggestions
- Import sessions track bulk promotion results

---

## Phase 5 — Observability and intelligence

### Route rules (smart routing)
- Per-route routing rules with matcher types: `path`, `header`, `query`, `method`
- Rule actions: `upstream`, `redirect`, `static`
- Rules evaluated as ordered subroutes before the main proxy handler

### Request tracing
- Optional `X-Request-ID` injection using Caddy's per-request UUID
- Configurable header name and generate-if-missing behaviour

### Path rewrite
- Strip prefix, add prefix, and regex-based rewrite
- CORS response header configuration

### Mirror / shadow traffic
- Copy traffic to a shadow upstream with configurable sample rate (1–100%)

### Blue-green deployments
- Staging upstreams with traffic split percentage
- Uses weighted round-robin internally

### SLO tracking
- Per-route p95 and p99 latency targets
- Daily compliance evaluation stored in `slo_compliance`

### Anomaly detection baselines
- `anomaly_baselines` table stores per-metric, per-hour-of-week mean and stddev

---

## Phase 4 — OS family integrations

### AccessOS integration
- Route-level group-based authorization via AccessOS providers
- `accessosGroups` and `accessosProviderId` fields on routes

### MxWatch integration
- Per-route domain deliverability monitoring
- `mxwatch_domain` field on routes; results cached in `mxwatch_cache`

### PatchOS maintenance mode
- Put a route into maintenance mode (redirects to a maintenance URL) while preserving the original upstreams
- `maintenanceMode` and `maintenanceSavedUpstreams` fields on routes
- PatchOS version tracking in `patchos_versions`

---

## Phase 3 — Security and automation

### Secrets providers
- LockBoxOS, Vault, and env passthrough provider types
- `secrets_providers` table

### Scheduled changes
- Schedule route enable/disable/update/rollback at a specific time
- `scheduled_changes` table

### Traffic replay logs
- `traffic_replay_logs` table for recording replayed requests

### Composite health scores
- `route_health_scores` with score, uptime %, p95 latency, error rate, SLO compliance

---

## Phase 2 — Advanced routing

### WAF (Web Application Firewall)
- Coraza/OWASP CRS integration via `coraza-caddy` plugin
- Modes: `off`, `detect`, `blocking`
- Rule exclusions by Coraza rule ID
- WAF events stored in `waf_events`

### GeoIP access control
- Allow or block by country code (allowlist or blocklist mode)
- Challenge or block action

### mTLS
- Per-route mutual TLS with configurable CA certificate and `require_and_verify` / `verify_if_given` modes

### Bot challenge
- Cloudflare Turnstile and hCaptcha integration via forward_auth
- Skip-paths configuration

### Route tags
- Tag routes for filtering and organization (`route_tags` table)

### Route versions and rollback
- Every route edit creates a version snapshot
- Rollback to any previous version from the route detail page

### Drift detection (Fix 4)
- Roundtrip verification: Caddy config read back and diffed against expected
- `sync_status`, `sync_diff`, `sync_checked_at`, `sync_source` columns on routes
- Re-push button in the dashboard
- `sync_source` values: `manual`, `bootstrap`, `drift-repair`, `patchos`, `scheduled`

---

## Phase 1 — Core routing

### Initial release
- Single-container deployment (Caddy + Next.js + s6-overlay)
- Route CRUD with live Caddy push via Admin API
- TLS modes: `auto`, `dns`, `internal`, `custom`, `off`
- Wildcard domain support with automatic DNS-01 fallback
- HTTPS upstream auto-detection for ports 443, 8006, 8007, 8443, 9090, 9443, 10443
- Load balancing policies: round_robin, least_conn, ip_hash, random, weighted_round_robin
- Active health checks with path, interval, status code, body regex, and max response time
- Rate limiting with configurable key, window, and request count
- Basic auth per route
- Per-route IP allowlist
- Response compression (gzip + zstd)
- HTTP/2 and HTTP/3 (QUIC) enabled by default
- HSTS with optional includeSubDomains
- SSO / forward auth via configurable providers
- Redirect hosts, error hosts, and streams (TCP/UDP)
- Container scanner with Docker label support
- Audit log
- Analytics (traffic metrics, access log, health check history)
- Federation: agents, organizations, sites, nodes
- Certificate management UI with CT monitoring
- Access lists (IP rules + basic auth, satisfyMode: any/all)
- DNS providers for DNS-01 challenges
