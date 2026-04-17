# ProxyOS — Security & Polish Spec
## Authentication Hardening · Observability · Geo-blocking · Health Dashboard

**Version:** 2.1  
**Date:** April 2026  
**Status:** Implemented  
**Part of:** Homelab OS family (proxyos.app)

---

## Overview

This document covers the security hardening, observability improvements, UX polish, and deployment hardening shipped after the V2 federation release.

---

## 1. Authentication Hardening

### 1.1 bcrypt Password Hashing

Passwords are now hashed with bcrypt (cost factor 12) via `bcryptjs`.

**Migration:** Legacy SHA-256 hashes (64-char hex) are detected automatically on login and transparently upgraded to bcrypt in the same request. No admin action required. Detection uses `isLegacyHash()` which checks for the 64-char hex pattern.

**Affected procedures:** `login`, `register`, `create`, `updatePassword`, `disableTotp`

### 1.2 Login Rate Limiting

`users.login` is protected by an in-memory sliding window rate limiter (`packages/api/src/rateLimiter.ts`).

| Key | Limit | Window |
|-----|-------|--------|
| `email:<address>` | 5 failures | 15 minutes |
| `ip:<address>` | 20 failures | 15 minutes |

Both keys are checked. Whichever triggers first blocks the request. On success both keys are cleared.

**TOTP failures** also count against the rate limit. The counter is only cleared after both password and TOTP pass.

**TOCTOU fix:** `beginAttempt(key, max)` reserves a slot synchronously before bcrypt runs, so concurrent requests at the limit boundary cannot all bypass a full bucket. Slots are released via `endAttempt(key)` in a `finally` block.

### 1.3 TOTP (Two-Factor Authentication)

TOTP setup, verification, and disable UI is available in user profile settings.

- Setup generates a TOTP secret and `otpauth://` URI for QR code display
- User scans with any TOTP app and verifies a code before TOTP is activated
- Disable requires current password + current TOTP code
- Secrets are stored AES-256-GCM encrypted (keyed from `PROXYOS_SECRET`)

### 1.4 Profile / Password Ownership Checks

`updateProfile` and `updatePassword` now enforce that the caller owns the target account or holds the `admin` role. Previously any authenticated user could modify any other user's profile.

```
if (ctx.session.userId !== input.id && ctx.session.role !== 'admin') {
  throw new TRPCError({ code: 'FORBIDDEN' })
}
```

### 1.5 PROXYOS_SECRET Startup Validation

On startup (`instrumentation.node.ts`), `PROXYOS_SECRET` is validated:

| Environment | Missing or default | Outcome |
|-------------|-------------------|---------|
| `production` | yes | `process.exit(1)` with clear error |
| `development` | yes | `console.warn`, continues |

The dev sentinel value is `dev-secret-change-me`. Any deployment to production must set `PROXYOS_SECRET` to a random 32+ character string.

---

## 2. Encryption

### 2.1 AES-256-GCM (`packages/api/src/crypto.ts`)

All secrets stored in the database (TOTP secrets, SSO credentials) are encrypted with AES-256-GCM. The key is derived from `PROXYOS_SECRET` via SHA-256.

Format: `enc:v1:<base64url(iv[12] || tag[16] || ciphertext)>`

Values without the `enc:v1:` prefix are treated as plaintext (legacy compatibility).

**Bug fix:** `decipher.update()` now explicitly calls `.toString('utf8')` before string concatenation to prevent silent UTF-8 corruption at chunk boundaries for multi-byte characters.

---

## 3. Geo-blocking

### 3.1 Per-Route Geo-blocking

Each route can have a geo-blocking policy stored in `routeSecurity.geoipConfig`. The policy is applied as a Caddy subroute handler injected before SSO.

```json
{
  "mode": "blocklist",
  "countries": ["CN", "RU", "KP"],
  "action": "block"
}
```

| Field | Values | Description |
|-------|--------|-------------|
| `mode` | `allowlist` / `blocklist` | Whether the country list is an allow or block list |
| `countries` | ISO 3166-1 alpha-2 array | Country codes |
| `action` | `block` | Always 403 (challenge reserved for future use) |

Requires Caddy to be built with the MaxMind GeoIP module.

### 3.2 Client-Side Rule Tester

The route security card includes a real-time rule tester. Enter a 2-letter country code and the UI instantly simulates whether that country would be blocked or allowed by the current (unsaved) configuration — no network request needed.

### 3.3 High-Risk Country Preset

One-click button populates the country list with a curated set of high-risk countries commonly used for brute-force and scanning traffic.

---

## 4. IP Access Lists (`packages/caddy/src/config.ts`)

IP allow/deny rules are applied as Caddy subroute matchers.

**Bug fix:** `remote_ip` is a Caddy **matcher**, not a handler. It was previously placed in the `handle[]` array (silently ignored). It is now correctly placed inside `match[]` within a subroute:

- **Deny rule:** Match `remote_ip` → `static_response 403`
- **Allow rule:** Match `not: [remote_ip]` → `static_response 403`

---

## 5. Wildcard Domain Support

### 5.1 TLS Mode Auto-selection

`buildTlsPolicy` in `packages/caddy/src/config.ts` detects wildcard domains (`*.example.com`) and automatically selects the correct TLS issuance method:

| DNS Provider configured | TLS method |
|------------------------|------------|
| Yes | ACME DNS-01 challenge (Let's Encrypt) |
| No | Caddy internal CA |

HTTP-01 (`auto`) cannot issue wildcard certificates and is rejected at the API level with a `BAD_REQUEST` error.

### 5.2 Expose Wizard Auto-switch

When a user types a wildcard domain in the expose wizard, the TLS mode field automatically switches:
- To `dns` (and selects the first configured DNS provider) if DNS providers are configured
- To `internal` if no DNS providers are configured

The "Next" button is blocked if a wildcard domain is combined with `auto` TLS mode.

---

## 6. Observability

### 6.1 Prometheus Metrics (`/api/metrics`)

Metrics are exported in Prometheus text format at `/api/metrics`.

| Metric | Type | Description |
|--------|------|-------------|
| `proxyos_route_requests_total` | counter | All-time requests per route and status class (2xx/4xx/5xx) |
| `proxyos_route_bytes_total` | counter | All-time bytes transferred per route |
| `proxyos_route_request_duration_seconds` | gauge | Mean request duration, 5-min rolling window |
| `proxyos_route_upstream_health` | gauge | Route enabled (1) / disabled (0) |
| `proxyos_agent_status` | gauge | Agent online (1) / offline (0) |
| `proxyos_agent_routes_total` | gauge | Route count per agent |
| `proxyos_cert_expiry_days` | gauge | Days until certificate expires |
| `proxyos_connection_status` | gauge | Connection health |

**Counter semantics:** `requests_total` and `bytes_total` use all-time DB aggregation (not a rolling window). They are monotonically increasing and never reset unless the database is wiped. This eliminates the sawtooth pattern in Grafana caused by process restarts.

**Latency label fix:** The duration gauge uses `type="mean"` label. The previous `quantile="0.95"` label was incorrect (the value is a mean, not a p95) and would cause misleading Grafana panels.

### 6.2 Upstream Health Dashboard (`/health`)

A dedicated page for testing all configured upstream connections.

**Features:**
- "Test all" button runs health checks for all routes in parallel
- Per-route "Test" button for targeted testing
- Per-upstream result rows: address, HTTP status badge, latency in ms, error message
- Status dots: neutral (untested) → amber (pending) → green/red (result)
- Summary pills: Tested / All up / Issues counts
- Timestamps showing when each route was last tested

Results are held in client-side state and cleared on page reload.

---

## 7. Deployment

### 7.1 Docker HEALTHCHECK

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health | grep -q '"status":"ok"' || exit 1
```

The `/api/health` endpoint returns:
- `200 { status: "ok", db: "ok", version, timestamp }` — healthy
- `503 { status: "degraded", db: "fail", ... }` — DB unreachable

A `degraded` response fails the healthcheck. Docker will mark the container unhealthy after 3 consecutive failures.

---

## 8. Sidebar Navigation

The sidebar now includes:

| Page | Path | Section |
|------|------|---------|
| Upstream health | `/health` | Main (between Analytics and Certificates) |

---

## Security Considerations

- `PROXYOS_SECRET` must be set to a unique random value in every deployment. It keys all at-rest encryption.
- Geo-blocking requires MaxMind GeoLite2 or GeoIP2 database to be configured in Caddy. Without it, geo matchers are a no-op.
- Rate limiting state is in-memory and resets on process restart. A determined attacker who can trigger restarts (e.g. OOM) can bypass it. For internet-exposed deployments, add a network-level rate limiter (Cloudflare, Nginx, or firewall rules) in front.
- bcrypt at cost 12 adds ~250ms per login on modern hardware. This is acceptable for human login flows and intentional — it slows brute force.
