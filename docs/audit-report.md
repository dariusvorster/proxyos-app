# ProxyOS Security & Code Quality Audit

Date: 2026-04-18  
Auditor: Security Auditor Agent (V3)  
Scope: Full monorepo — auth, API surface, secrets handling, container/deployment

---

## CRITICAL

---

## packages/api/src/auth.ts

- Finding: Token cookie missing `Secure` flag. `makeTokenCookie` (line 51) produces `HttpOnly; Path=/; SameSite=Lax; Max-Age=…` with no `Secure` attribute. If the container is ever reached over plain HTTP (e.g. a misconfigured reverse proxy, initial setup before force-HTTPS is enabled, or the internal port 3000 accessed directly), the session token is transmitted in cleartext.
- Severity: high
- Fix: Append `; Secure` to the cookie string. The flag has no effect over HTTPS and prevents silent downgrade leakage over HTTP. Example: ``return `${TOKEN_COOKIE}=${token}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${EXPIRES_IN}` ``

---

## packages/api/src/auth.ts

- Finding: Homegrown JWT implementation. `signToken`/`verifyToken` (lines 14–35) hand-roll JWT signing and parsing rather than using a battle-tested library. The implementation is mostly correct (timingSafeEqual, expiry check), but there is no algorithm header validation — an attacker who can forge a token with `alg: none` or swap to a symmetric/asymmetric mismatch won't be caught because the verifier unconditionally uses HMAC-SHA256 regardless of the header field. The `header` segment is parsed but the `alg` field is never inspected before producing the expected signature.
- Severity: high
- Fix: Either validate that `payload.alg === 'HS256'` after decoding the header before computing the expected signature, or replace with `jose` / `jsonwebtoken` which enforce algorithm binding by default.

---

## packages/api/src/auth.ts

- Finding: Weak default secret. `secret()` (line 7) falls back to the literal string `'dev-secret-change-me'` when `PROXYOS_SECRET` is not set. The `proxyos/run` s6 script validates that `PROXYOS_SECRET` is present before starting Node, but the Node process itself will start if invoked outside s6 (e.g. during development, CI, or bare `node server.js` invocation) with the well-known default. Any token signed with the default secret is universally forgeable. The same default is used in `crypto.ts` for AES key derivation, meaning all encrypted TOTP secrets are also trivially decryptable.
- Severity: high
- Fix: In `secret()` and `deriveKey()`, throw a hard error at startup if the env var is absent rather than silently using a fallback. At minimum add: `if (!process.env.PROXYOS_SECRET) throw new Error('PROXYOS_SECRET must be set')`.

---

## packages/api/src/routers/users.ts — setupTotp

- Finding: IDOR on TOTP setup. `setupTotp` (line 232) is a `protectedProcedure` that accepts a `userId` input and fetches any user's record to generate a TOTP secret. Any authenticated user (including role `viewer`) can call `setupTotp({ userId: '<admin-id>' })` to generate a fresh TOTP secret URI for the admin account. The secret is not stored at this step, so this alone doesn't hijack the account — but it leaks the admin's email and produces a valid QR URI tied to the admin account label, and if combined with `verifyAndEnableTotp` being miscalled it could overwrite the admin TOTP.
- Severity: high
- Fix: Add an ownership check at line 234: `if (ctx.session.userId !== input.userId && ctx.session.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' })`. The same pattern already exists in `updateProfile` and `updatePassword` — apply it consistently here.

---

## packages/api/src/routers/users.ts — verifyAndEnableTotp

- Finding: IDOR on TOTP enable. `verifyAndEnableTotp` (line 243) is a `protectedProcedure` with no ownership check. Any authenticated viewer can call it with any `userId` and a `secret`/`code` they choose, overwriting that user's stored TOTP secret and enabling TOTP on the account. This is a privilege-escalation path: a viewer could enable TOTP on the admin account using a secret only the viewer knows, effectively locking the admin out.
- Severity: critical
- Fix: Add `if (ctx.session.userId !== input.userId && ctx.session.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' })` before line 246.

---

## packages/api/src/routers/users.ts — disableTotp

- Finding: IDOR on TOTP disable. `disableTotp` (line 256) is `protectedProcedure` with no ownership check. A viewer who knows another user's password and current TOTP code can disable that user's TOTP. The password and code requirements provide some protection, but the authorization check is still missing.
- Severity: high
- Fix: Same ownership check pattern as above before line 259.

---

## packages/api/src/routers/users.ts — getProfile

- Finding: IDOR on profile read. `getProfile` (line 141) accepts an arbitrary `id` and returns `email`, `role`, `lastLogin`, `createdAt`, and `totpEnabled` for any user. Any authenticated viewer can enumerate all user IDs (which are nanoid strings but obtainable via the audit log, route ownership, etc.) and retrieve the profile of any user including admins. For a homelab single-user instance this is low risk; for multi-user orgs it leaks PII.
- Severity: medium
- Fix: Add `if (ctx.session.userId !== input.id && ctx.session.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' })` to restrict cross-user profile reads to admins.

---

## packages/api/src/routers/users.ts — claimRoute / releaseRoute

- Finding: Missing authorization on route ownership mutation. `claimRoute` (line 283) and `releaseRoute` (line 292) are `protectedProcedure` — any authenticated user including viewers can claim or release ownership of any route. `claimRoute` also accepts a `userId` input with no check that it matches the caller, so a viewer can claim a route on behalf of the admin.
- Severity: medium
- Fix: Restrict to `operatorProcedure` or at minimum validate `ctx.session.userId === input.userId` in `claimRoute`.

---

## packages/api/src/routers/users.ts — getDashboardSSO

- Finding: SSO client secret returned to unauthenticated callers. `getDashboardSSO` (line 301) is `publicProcedure`. It returns the full parsed `DashboardSSOSchema` object, which includes `clientSecret`. Any unauthenticated request to the tRPC endpoint can retrieve the OAuth client secret configured for dashboard SSO.
- Severity: critical
- Fix: Either change to `protectedProcedure`/`adminProcedure`, or redact `clientSecret` from the response (return `{ ...config, clientSecret: '***' }`). The comment on line 311 says "store full value since db is encrypted at rest" — that justifies DB storage but not unauthenticated API exposure.

---

## packages/api/src/routers/users.ts — register

- Finding: Open registration with no rate limiting. `register` (line 128) is `publicProcedure` with no rate limiting. An attacker can create an unlimited number of viewer accounts or attempt to enumerate whether an email is registered (the error on conflict reveals this). The TOTP brute-force protection exists on login but not on registration.
- Severity: medium
- Fix: Apply the same IP-based rate limiting as login (5–10 registrations per IP per 15 minutes) and consider requiring an invite token or admin approval for all registrations after the first admin account is created.

---

## packages/api/src/routers/users.ts — updatePassword (admin path)

- Finding: Admin can change any user's password without knowing the current password. `updatePassword` (line 168) enforces `currentPassword` verification only when `ctx.session.userId === input.id`. When an admin changes another user's password (line 171 allows it), the `verifyPassword` call at line 176 still checks `input.currentPassword` against the target user's hash — but line 171's condition only skips the FORBIDDEN error; it does not skip the password verification. On closer reading the admin IS still required to supply the target user's current password. This is a UX issue (admin cannot reset a forgotten password), not a security bypass — but it means an admin cannot perform a forced password reset without knowing the current one. This is likely unintended.
- Severity: low
- Fix: When `ctx.session.role === 'admin'` and `ctx.session.userId !== input.id`, skip the `verifyPassword` check and proceed directly to `hashPassword(input.newPassword)`.

---

## packages/api/src/crypto.ts

- Finding: Encryption key derived with SHA-256 instead of a KDF. `deriveKey()` (line 5–8) uses `createHash('sha256').update(secret)` to derive the AES-256-GCM key. SHA-256 is not a key derivation function — it provides no salt, no iteration count, and no resistance to brute force if the secret is low-entropy. If `PROXYOS_SECRET` is a short or guessable string, the AES key is easily derived offline from any extracted ciphertext.
- Severity: medium
- Fix: Replace with `crypto.scryptSync(secret, staticSalt, 32)` or HKDF (`crypto.hkdfSync`). A static per-installation salt stored alongside the secret (or derived from a second env var) would eliminate the no-salt issue without requiring re-encryption of existing data.

---

## packages/api/src/crypto.ts

- Finding: `decrypt()` silently returns plaintext for unencrypted values (line 22). The comment acknowledges this is for backwards compatibility with pre-encryption TOTP secrets. If any code path stores a raw TOTP secret to the DB (e.g. a migration script, test fixture, or a future bug), `decrypt` will silently return it without error, and `verifyTotp` will silently operate on the cleartext base32 string. This is a silent failure mode rather than an explicit error, which makes detecting misconfiguration harder.
- Severity: low
- Fix: Log a warning when the fallback path is taken so it's observable. Once all secrets have been migrated, consider removing the plaintext fallback and failing hard.

---

## apps/web/src/app/api/metrics/route.ts

- Finding: Metrics endpoint unauthenticated when `METRICS_TOKEN` is not set. Lines 8–14: if `METRICS_TOKEN` env var is absent, the entire Prometheus metrics endpoint is publicly accessible. The metrics expose route counts, request rates, error rates, and latency data. For a homelab this is low risk, but the endpoint is also exposed on the same port as the UI (3000) behind whatever the user's reverse proxy is.
- Severity: medium
- Fix: Default to requiring authentication rather than defaulting to open. Either require `METRICS_TOKEN` to be set (fail closed at startup) or document the open-metrics behavior explicitly as a required conscious opt-in.

---

## apps/web/src/app/api/grafana-dashboard/route.ts

- Finding: Grafana dashboard JSON served unauthenticated. The `GET /api/grafana-dashboard` endpoint (line 7) has no authentication check. It serves a static JSON file, which is not sensitive by itself, but it confirms the software version, internal metric names, and dashboard structure to unauthenticated clients.
- Severity: low
- Fix: Add a Bearer token check (same `METRICS_TOKEN` pattern) or restrict to authenticated users if the dashboard is only downloaded by admins.

---

## apps/web/src/app/api/health/route.ts

- Finding: Health endpoint leaks version string. Line 17 returns `process.env.PROXYOS_VERSION ?? '3.0.0'` in the unauthenticated health response. Exact version disclosure is a reconnaissance aid.
- Severity: low
- Fix: Either omit version from the public health response or gate it behind authentication. Returning `{ status, db }` is sufficient for health-check purposes.

---

## apps/web/src/app/api/v1/[[...slug]]/route.ts — POST /routes

- Finding: No input validation on domain or upstream values beyond type-coercion. Lines 137–148: `body.domain` is stored as `String(body.domain)` with no format validation — there is no check that it is a valid hostname, does not contain wildcards, CRLF characters, or other values that could corrupt the Caddy config JSON when serialized. Similarly `body.upstreams` is `JSON.stringify(body.upstreams)` with no schema validation on the upstream addresses.
- Severity: medium
- Fix: Add Zod or manual validation for the `domain` field (valid hostname regex) and upstream addresses before inserting. The tRPC `routes` router likely has equivalent validation — check if it can be reused or its schema extracted to a shared location.

---

## apps/web/src/app/api/v1/[[...slug]]/route.ts — PUT /routes/:id

- Finding: `tlsMode` value accepted without validation (line 213). Any string is accepted for `tlsMode` and stored directly. If Caddy consumes this field in the config, an attacker with a `routes` scope API key could set `tlsMode` to an unexpected value and potentially influence Caddy config generation.
- Severity: medium
- Fix: Validate `tlsMode` against an enum of valid values (`'auto'`, `'off'`, `'manual'`, etc.) before storing.

---

## packages/api/src/apiKeyAuth.ts

- Finding: API key hashed with bare SHA-256 (no HMAC, no salt). `hashApiKey` (line 7) uses `createHash('sha256')`. If the DB is compromised, an attacker can brute-force the 32-byte random keys offline. While `pxos_` + 24 random bytes (192 bits) provides strong entropy making brute force impractical, SHA-256 without salt or stretching is weaker than necessary for a stored credential.
- Severity: low
- Fix: Use HMAC-SHA256 with a server-side secret (`PROXYOS_SECRET`) as the key so that DB-only access is insufficient to validate keys: `createHmac('sha256', secret).update(key).digest('hex')`. This is a defence-in-depth measure given the key entropy is already high.

---

## packages/api/src/rateLimiter.ts

- Finding: In-memory rate limiter resets on process restart. The comment on line 3 acknowledges this. An attacker who triggers a container restart (OOM, crash, deployment) can reset all rate limit counters and retry brute force from a clean slate.
- Severity: medium
- Fix: For a homelab single-instance deployment this is an accepted trade-off, but it should be documented. A simple mitigation is to persist the block state to SQLite on the `setInterval` cleanup tick and reload on startup. Alternatively, use a short exponential backoff (delay response rather than rejecting) which survives restarts by nature.

---

## packages/api/src/trpc.ts — clientIp

- Finding: Client IP taken from `X-Forwarded-For` without validation. Line 39: `req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()`. If ProxyOS is behind another reverse proxy that does not strip or validate this header, a client can spoof the IP used for rate limiting by setting `X-Forwarded-For: 1.2.3.4`. This would allow an attacker to cycle through arbitrary IP values to evade the per-IP rate limit on login.
- Severity: medium
- Fix: Only trust `X-Forwarded-For` if it originates from a known trusted proxy. Either configure the number of trusted proxy hops and read the correct position in the comma-separated list, or use `X-Real-IP` set by a controlled proxy layer. Document which header is authoritative.

---

## packages/api/src/routers/users.ts — TOTP login flow

- Finding: Partial credential disclosure before TOTP check. Lines 95–96: when a user has TOTP enabled but no `totpCode` is submitted, the server returns `{ requiresTotp: true, id: null, email: null, ... }`. This is correct — it does not reveal user data. However, it also means the server has already confirmed password validity before asking for TOTP. An attacker who submits the correct password will receive `requiresTotp: true`, confirming the password is correct, before needing to supply a TOTP code. Rate limit counters are NOT incremented on this partial success path (lines 106–107 clear the limit). A separate TOTP brute-force attempt can then proceed on a known-valid password without consuming the password failure budget.
- Severity: medium
- Fix: Do not clear rate limit counters until both password and TOTP have been verified. Move `clearLimit` calls to after the TOTP block. Additionally, apply a separate rate limit to the TOTP submission step (the `totpCode` present branch) so that TOTP codes can only be attempted a limited number of times per successful password.

---

## docker/s6-overlay/s6-rc.d/proxyos/run

- Finding: `eval` used for env var validation (line 6). The loop uses `eval "VAL=\$$VAR"` to read the value of a variable named by `$VAR`. If `VAR` contains shell metacharacters (it doesn't here since the list is hardcoded), this would be a command injection vector. As written the list is static so there is no injection risk, but `eval` for variable indirection is fragile.
- Severity: low
- Fix: Replace with POSIX-compatible parameter expansion without eval: use a case statement or `printenv "$VAR"` to read the value. Example: `VAL=$(printenv "$VAR" || true)`.

---

## Dockerfile

- Finding: `EXPOSE 2019` publishes the Caddy admin API port. Line 86 exposes port 2019. The Caddy admin API has no authentication and allows full config replacement, route injection, and Caddy shutdown. If the container is run with `-p 2019:2019` or `network_mode: host`, the admin API is accessible from outside the container. The `docker-compose.yml` is locked, but if other users add port mappings this is a serious risk.
- Severity: medium
- Fix: Remove `2019` from `EXPOSE` — it only needs to be reachable from within the container. Document that port 2019 must never be published externally.

---

## Dockerfile — native deps installation

- Finding: `npm install` inside the runner stage fetches packages from the internet at build time with pinned versions but no integrity verification for the build step itself. Lines 65–70 run `npm install better-sqlite3@11.5.0` etc. without a lockfile, relying on the version pin alone. A compromised npm registry or MITM could serve a malicious package.
- Severity: low
- Fix: Copy a `package-lock.json` for these native deps into the build context and use `npm ci` instead of `npm install --no-save`, or vendor the native binaries into the repo.

---

## packages/api/src/totp.ts

- Finding: TOTP verification window of ±1 step (±30 seconds each side = 90-second window). This is standard RFC 6238 and not a bug, but used codes are not invalidated after first use. If an attacker intercepts a valid TOTP code, they have up to 90 seconds to replay it.
- Severity: low
- Fix: Track the last accepted counter value per user in the DB and reject any code with a counter <= the last accepted counter. This is a standard TOTP hardening measure.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 5 |
| Medium | 8 |
| Low | 7 |

**Critical items requiring immediate action:**
1. `getDashboardSSO` is public and returns the OAuth `clientSecret` — any unauthenticated user can retrieve SSO credentials.
2. `verifyAndEnableTotp` has no ownership check — any authenticated viewer can overwrite the TOTP secret of any user including admins.
