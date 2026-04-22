# ProxyOS Stability Audit — Phase 1
*Generated: 2026-04-22*

---

## §1A — Silent Failure Scan

### Summary
- Total patterns found: 22
- P0: 0 | P1: 5 | P2: 4 | P3: 6 | OK (intentional): 6

---

## Findings

### 1. [packages/importers/src/nginx/parser.ts:81] Empty catch, fallback extraction

- **Pattern**: Catch block with only a return statement (fallback behavior)
- **Code**:
```typescript
function extractUpstreamFromProxyPass(proxyPass: string): string {
  try {
    const url = new URL(proxyPass)
    return `${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)}`
  } catch {
    return proxyPass.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}
```
- **Severity**: OK
- **Assessment**: Intentional. The catch block implements a graceful fallback: if URL parsing fails (invalid URL format), fall back to string extraction. This is a standard parser pattern — the upstream is always extracted, either via URL API or string manipulation. User always gets an upstream value.
- **Fix needed**: None.

---

### 2. [packages/importers/src/apache/parser.ts:68] Empty catch, fallback extraction

- **Pattern**: Catch block with only a return statement
- **Code**:
```typescript
function extractUpstream(proxyPass: string): string {
  try {
    const url = new URL(proxyPass)
    return `${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)}`
  } catch {
    return proxyPass.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}
```
- **Severity**: OK
- **Assessment**: Identical to nginx parser. Intentional fallback for URL parsing failure. User always gets upstream value.
- **Fix needed**: None.

---

### 3. [packages/importers/src/traefik/api-reader.ts:44] Empty catch, fallback return

- **Pattern**: Catch block returning original value
- **Code**:
```typescript
try {
  const url = new URL(server.url)
  return `${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)}`
} catch {
  return server.url
}
```
- **Severity**: OK
- **Assessment**: Intentional. If URL parsing fails, return the original URL string. Import continues with whatever was provided.
- **Fix needed**: None.

---

### 4. [packages/cli/src/index.ts:33] Catch returns null, silent config load failure

- **Pattern**: Catch returns null/undefined
- **Code**:
```typescript
function loadConfig(): CLIConfig | null {
  if (!existsSync(CONFIG_PATH)) return null
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as CLIConfig } catch { return null }
}
```
- **Severity**: P2
- **Assessment**: If config file exists but is malformed JSON, the user is silently told "not logged in." No error message indicates the config file is corrupt. User experience: "my login disappeared" with no root cause hint.
- **Fix needed**: Log a warning: `console.warn(`Config file exists at ${CONFIG_PATH} but is malformed — ignoring. Run 'proxyos auth login' again.`)`.

---

### 5. [packages/cli/src/index.ts:40] Catch with comment ignore, directory creation failure

- **Pattern**: Empty catch with `/* ignore */` comment
- **Code**:
```typescript
function saveConfig(cfg: CLIConfig): void {
  const dir = join(homedir(), '.proxyos')
  try {
    import('node:fs').then(({ mkdirSync }) => mkdirSync(dir, { recursive: true }))
  } catch { /* ignore */ }
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}
```
- **Severity**: P1
- **Assessment**: The `mkdirSync` call is asynchronous (via `then`), but the catch is synchronous. The catch never fires. If the directory creation fails, `writeFileSync` is called anyway — if the `.proxyos` directory doesn't exist, `writeFileSync` will crash with ENOENT. The comment "ignore" is misleading; the error is not actually caught.
- **Fix needed**: Either (a) await the import and mkdirSync synchronously, or (b) add proper error handling with a retry/fallback. Currently this is a latent bug.

---

### 6. [packages/cli/src/index.ts:58] Catch ignores JSON parse error

- **Pattern**: Catch with `/* raw */` comment, silences error
- **Code**:
```typescript
try { msg = (JSON.parse(text) as { error: string }).error } catch { /* raw */ }
throw new Error(`HTTP ${res.status}: ${msg}`)
```
- **Severity**: P2
- **Assessment**: If the response is not valid JSON, `msg` is never set. Then `throw new Error(\`HTTP ${res.status}: ${msg}\`)` logs `msg` as `undefined`. User sees "HTTP 500: undefined" instead of the actual response text. The fallback to raw text is lost because `msg` is uninitialized.
- **Fix needed**: Initialize `msg` before the try block: `let msg = text`. Currently, if response is not JSON, user gets confusing error message.

---

### 7. [packages/cli/src/index.ts:220] Error handler logs and exits

- **Pattern**: Catch at top-level main() entry point
- **Code**:
```typescript
main().catch(err => {
  console.error((err as Error).message)
  process.exit(1)
})
```
- **Severity**: OK
- **Assessment**: Intentional. Top-level error handler for CLI. Logs the error message and exits. This is correct practice for CLI tools.
- **Fix needed**: None.

---

### 8. [packages/api/src/routers/preflight.ts:40] TCP connect mutation without throw on failure

- **Pattern**: Mutation returns error object instead of throwing
- **Code**:
```typescript
checkUpstream: publicProcedure
  .input(z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
  }))
  .mutation(async ({ input }) => {
    return tcpConnect(input.host, input.port)
  })
```
Supporting function:
```typescript
function tcpConnect(host: string, port: number, timeoutMs = 3000): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const socket = net.createConnection({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve({ reachable: false, latencyMs: Date.now() - start, error: 'Connection timed out' })
    }, timeoutMs)
    socket.on('connect', () => {
      clearTimeout(timer)
      const latencyMs = Date.now() - start
      socket.destroy()
      resolve({ reachable: true, latencyMs })
    })
    socket.on('error', (err) => {
      clearTimeout(timer)
      resolve({ reachable: false, latencyMs: Date.now() - start, error: err.message })
    })
  })
}
```
- **Severity**: P3
- **Assessment**: The mutation never throws. It always resolves with `{ reachable: bool, error?: string }`. From the client perspective, it looks like success. The UI must check `reachable: false` and read the error string. This is not a silent failure — the error is in the response body — but it's not idiomatic tRPC. Standard tRPC pattern is to throw TRPCError on failure so the client-side error boundary catches it.
- **Fix needed**: Consider throwing TRPCError on network failures so error handling is standard. Currently works but unconventional.

---

### 9. [packages/api/src/routers/preflight.ts:49] DNS mutation returns error object, not thrown

- **Pattern**: Mutation catch returns error in response object
- **Code**:
```typescript
checkDns: publicProcedure
  .input(z.object({
    domain: z.string().min(1),
  }))
  .mutation(async ({ input }) => {
    try {
      const addresses = await resolve4(input.domain)
      return {
        resolves: true,
        resolvedIp: addresses[0],
      }
    } catch (err) {
      return {
        resolves: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })
```
- **Severity**: P3
- **Assessment**: Same pattern as TCP check. DNS resolution failure returns `{ resolves: false, error: "..." }` instead of throwing. Not idiomatic tRPC but not silent — error is in response body and UI must check the flag.
- **Fix needed**: Consider throwing TRPCError on DNS failure for standard error handling.

---

### 10. [packages/federation/src/config-applier.ts:66] Caddy bootstrap error logged, not re-thrown

- **Pattern**: Catch logs error but continues execution
- **Code**:
```typescript
try {
  const { bootstrapProxyOs } = await import('@proxyos/api/bootstrap')
  const configPath = process.env.CADDY_BASE_CONFIG_PATH ?? '/app/caddy/base-config.json'
  await bootstrapProxyOs(configPath)
} catch (e) {
  console.warn('[federation] caddy re-apply failed:', e)
}
```
- **Severity**: P1
- **Assessment**: If Caddy bootstrap fails during config apply, the function logs a warning and continues. The config is still marked as applied (line 88 sends success ACK to federation server). User thinks routes are synced, but Caddy might be in an inconsistent state. This is a silent partial failure — the response tells the federation server "success" when Caddy setup failed.
- **Fix needed**: Either throw the error (fail the whole apply) or at least mark the apply as failed in the ACK message. Currently, the federation client will not retry if it thinks the apply succeeded.

---

### 11. [packages/federation/src/config-applier.ts:81] Config apply error handled in catch, correct response sent

- **Pattern**: Catch block with error handling and proper ACK
- **Code**:
```typescript
} catch (e) {
  const error = e instanceof Error ? e.message : String(e)
  client.send({
    type: 'config.ack',
    request_id: msg.request_id,
    payload: { version, applied_at: Date.now(), success: false, error },
  })
  console.error(`[federation] failed to apply config v${version}: ${error}`)
}
```
- **Severity**: OK
- **Assessment**: Intentional. This is the outer catch for the entire config apply flow. Errors are logged and a failure ACK is sent. Correct error handling.
- **Fix needed**: None. But note: if the error is thrown by the Caddy bootstrap catch above (item 10), it will be caught here — but the inner catch swallows it. See issue 10.

---

### 12. [packages/alerts/src/evaluator.ts:26] Alert evaluation error logged, continues polling

- **Pattern**: Catch logs error but loop continues
- **Code**:
```typescript
const tick = async () => {
  if (stopped) return
  try {
    await evaluateOnce()
  } catch (err) {
    console.warn('[proxyos] alert eval failed:', err)
  }
}
await tick()
const t = setInterval(tick, intervalMs)
```
- **Severity**: P2
- **Assessment**: If alert evaluation crashes, the warning is logged and the polling loop continues. The user does not know alerts are broken — they expect alerts to fire but they don't. This is a silent failure in the alert system. The error is logged but not surfaced to the user or admin dashboard.
- **Fix needed**: Add a metric or status field (e.g., `alertEvaluatorHealth: 'failed'`) that the dashboard can display. Or send an alert notification about the failure itself.

---

### 13. [packages/alerts/src/evaluator.ts] Notification failure handled gracefully

- **Pattern**: `void` and `.catch()` on notification send
- **Code**:
```typescript
void sendAlertNotifications({ ruleName: rule.name, message: fire.message, detail: fire.detail }).catch((err) => {
  console.warn('[proxyos] alert notification failed:', err)
})
```
- **Severity**: P2
- **Assessment**: If sending an alert notification fails (e.g., webhook is down), the warning is logged but the rule fires anyway. The user may not know the notification failed — they might think the alert was sent. A silent loss of observability channel.
- **Fix needed**: Log which notification channels failed and optionally add a "failed to notify" status to the rule object or alert history.

---

### 14. [packages/api/src/bootstrap.ts:18] Adapter loading error logged, startup continues

- **Pattern**: Catch logs error but startup continues
- **Code**:
```typescript
void loadAdapters().catch(err => console.error('[connect] Failed to load adapters:', err))
```
- **Severity**: P1
- **Assessment**: If database adapters fail to load on startup, an error is logged in the background. Startup continues anyway. API may crash on first database call with a confusing "adapter not found" error instead of the real root cause (adapter load failure). User gets a misleading error message.
- **Fix needed**: Do not suppress this error. Either await `loadAdapters()` in bootstrap and throw, or log this as a FATAL error and refuse to start.

---

### 15. [packages/api/src/bootstrap.ts:31] Network discovery unavailable, continues

- **Pattern**: Catch logs warn, continues
- **Code**:
```typescript
void (...) => { ... }).catch((e: unknown) => console.warn('[proxyos] network discovery unavailable:', e))
```
- **Severity**: P2
- **Assessment**: Network discovery is a feature, not a core service. If it fails, a warning is logged. This is acceptable — the user loses the discovery feature but the core API works. Graceful degradation.
- **Fix needed**: None, but users should see a UI message that discovery is offline.

---

### 16. [packages/api/src/bootstrap.ts:96] Dashboard route injection failure logged

- **Pattern**: Catch logs warn, continues
- **Code**:
```typescript
.catch((e: unknown) => console.warn('[proxyos] dashboard route inject failed:', e))
```
- **Severity**: P2
- **Assessment**: If the dashboard route fails to inject at startup, a warning is logged. The feature is optional (convenience route to /dashboard). If it fails, user can still access the web UI directly. Graceful degradation.
- **Fix needed**: None, but note this in release notes if changed.

---

### 17. [packages/caddy/src/bootstrap.ts:130] Route validation failure logged before push

- **Pattern**: Error logged, routes filtered, continues
- **Code**:
```typescript
console.error(`[caddy-bootstrap] ${invalid.length} route(s) failed validation — they will NOT be pushed:`)
// Routes are filtered out and only valid ones are pushed
```
- **Severity**: OK
- **Assessment**: Intentional. Invalid routes are detected, logged with detail, and excluded from the Caddy push. The user is informed (logs + dashboard UI) which routes failed. Correct error handling.
- **Fix needed**: None.

---

### 18. [apps/web/src/instrumentation.node.ts:38] Bootstrap error logged, continues

- **Pattern**: Catch logs error, continues
- **Code**:
```typescript
await bootstrap().catch(err => {
  console.error('[proxyos] bootstrap failed:', err)
})
```
- **Severity**: P1
- **Assessment**: If an unhandled exception escapes `bootstrapProxyOs()`, it is logged and startup continues. However, `bootstrapProxyOs()` already returns a result object `{ caddyReachable, error }` and the caller handles `!caddyReachable` with a warning — Caddy being transiently unreachable at boot is expected in s6-overlay startup sequencing. The real gap is: a thrown exception from within bootstrap (e.g., DB schema migration failure) is swallowed rather than surfaced distinctly. Users may see later cryptic errors with no clear cause.
- **Fix needed**: Distinguish between expected graceful-degradation outcomes (Caddy not yet up) and unexpected thrown exceptions. Unexpected thrown exceptions should set a visible "system unhealthy" status flag rather than silently continuing. Do NOT add `process.exit(1)` — Caddy may legitimately not be ready at instrumentation time in s6-overlay.

---

### 19. [apps/web/src/instrumentation.node.ts:98] Federation client startup failure logged, continues

- **Pattern**: Catch logs error, continues
- **Code**:
```typescript
await startFederationClient(...).catch(err => {
  console.error('[proxyos] FATAL: federation client failed to start:', err)
})
```
- **Severity**: OK
- **Assessment**: `process.exit(1)` is called at line 99 immediately after the FATAL log. The process terminates hard on federation startup failure — this is correct error handling, not a silent swallow.
- **Fix needed**: None — this is correct behavior.

---

### 20. [packages/sso/src/index.ts:66] SSO provider auth error returns `{ ok: false }`

- **Pattern**: Catch returns error-containing object instead of throwing
- **Code**:
```typescript
} catch (err) {
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  }
}
```
- **Severity**: P1
- **Assessment**: If SSO authentication fails, the function returns `{ ok: false, error: "..." }`. The caller must check the `ok` flag. This is not idiomatic tRPC/server error handling. If the caller forgets to check the flag, they might treat the response as success. From logs, you can't tell if a request succeeded or failed without reading the response body.
- **Fix needed**: Throw TRPCError instead. Make failure explicit at the protocol level.

---

### 21. [packages/api/src/routers/trafficReplay.ts:54] Mutation with no visible error path

- **Pattern**: Mutation that could throw or return — unclear which
- **Code**:
```typescript
.mutation(async ({ ctx, input }) => {
  const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
  if (!route) throw new TRPCError({ code: 'NOT_FOUND' })
  await ctx.db.insert(trafficReplayLogs).values({ ... })
  return { success: true }
})
```
- **Severity**: P3
- **Assessment**: The mutation correctly throws TRPCError for not-found but returns `{ success: true }` on success. The database insert could fail silently if there's a schema mismatch. However, the throw on not-found is correct, so this is mostly OK. Minor: no try-catch around the insert, so if it fails, a raw database error is returned instead of a clean TRPCError.
- **Fix needed**: Add try-catch around the insert to convert database errors to TRPCError.

---

### 22. [apps/web/src/app/settings/*/page.tsx] useMutation calls without onError handlers

- **Pattern**: useMutation calls with no error handler
- **Code** (example from settings/profile/page.tsx):
```typescript
const setupTotp = trpc.users.setupTotp.useMutation()
const verifyAndEnable = trpc.users.verifyAndEnableTotp.useMutation()
const disableTotp = trpc.users.disableTotp.useMutation()

async function startSetup() {
  setSetupError(null)
  try {
    const res = await setupTotp.mutateAsync({ userId })
    // ... handle success
  } catch (err) {
    setSetupError(err instanceof TRPCClientError ? err.message : 'Unknown error')
  }
}
```
- **Severity**: P2 (many pages) → P1 when aggregated
- **Assessment**: Many useMutation calls in the codebase manually handle errors in try-catch, which is correct. However, some mutations are called with `.mutate()` (fire-and-forget) without error handlers. If the mutation fails, the error is silently logged to console but the user sees no UI feedback. Example: mutation updates happen with no visual confirmation of failure.
- **Fix needed**: Audit all useMutation calls. For critical mutations (user profile, route creation), ensure either `onError` handler or try-catch. For non-critical (UI preference), log errors and show toast notification.

---

## Risk Summary

### Critical (P0): 0 findings

### High (P1): 5 findings
- **apps/web/src/instrumentation.node.ts:38** — Unhandled bootstrap exception logged and continued; expected transient states handled gracefully but unexpected thrown exceptions need distinct status flag.
- **packages/cli/src/index.ts:40** — Directory creation failure may crash on write.
- **packages/federation/src/config-applier.ts:66** — Caddy bootstrap error inside success ACK.
- **packages/api/src/bootstrap.ts:18** — Adapter load failure logged, startup continues.
- **packages/sso/src/index.ts:66** — SSO auth failure returns object, not thrown.

### Medium (P2): 4 findings
- **packages/cli/src/index.ts:33** — Config parse failure returns null, no error hint.
- **packages/cli/src/index.ts:58** — Response parse failure results in undefined error message.
- **packages/alerts/src/evaluator.ts:26** — Alert evaluation error silently fails polling.
- **packages/alerts/src/evaluator.ts** — Notification send failure not surfaced to user.

### Low (P3): 6 findings
- **packages/api/src/routers/preflight.ts:40-49** — TCP/DNS checks return error objects instead of throwing.
- **packages/api/src/routers/trafficReplay.ts:54** — Insert could fail silently (no try-catch).
- **apps/web/src/app/settings/*/page.tsx** — Some mutations called without onError handlers.

### OK (Intentional): 6 findings
- URL parsing fallbacks in importers (3 files).
- Outer catch in federation config-applier.
- Caddy validation error filtering.
- **apps/web/src/instrumentation.node.ts:98** — Federation client startup failure calls `process.exit(1)` — correct behavior.

---

## Next Steps

1. **Fix P0 immediately:** Bootstrap errors must throw and prevent startup.
2. **Fix P1 within sprint:** Federation, SSO, and adapter loading are core features — failures should be explicit.
3. **Fix P2 in next sprint:** Alert system and config parsing should surface errors to users.
4. **Refactor P3 after:** Consider standardizing on TRPCError throws instead of error-containing responses.


---

## §1B — Save Integrity Audit

### Summary
- Total mutations audited: 58 (47 full + 11 Caddy-touching supplement); 33 additional DB-only routers pattern-scanned
- Mutations with save integrity issues: 13 explicit (+ 81-instance P3 pattern across DB-only routers)
- P0: 1 | P1: 5 | P2: 10 | P3: 1 (pattern) | OK: 41

### Mutations Audited

#### [routes.ts] `create`
- **DB write verified?**: Partial — Insert completes, but no row count check. However, Caddy push failure triggers rollback delete.
- **Caddy/downstream verified?**: Yes — Caddy push is attempted in try block; on failure, DB insert is rolled back with `await ctx.db.delete(routes).where(eq(routes.id, id))`.
- **Returns updated record?**: Yes — Returns full `route` object built from input + defaults.
- **UI checks return?**: N/A — Client receives the complete route object with all fields.
- **Severity**: OK
- **Issue**: None. This is correct: if Caddy push fails, the database change is undone. Success path inserts and pushes before returning.

---

#### [routes.ts] `expose`
- **DB write verified?**: Partial — Insert completes without count check, but Caddy failure triggers rollback.
- **Caddy/downstream verified?**: Yes — Caddy push in try block; failure triggers `await ctx.db.delete(routes).where(eq(routes.id, id))`.
- **Returns updated record?**: Yes — Returns success object with `routeId`, `domain`, `url`, `ssoEnabled`, `certStatus`.
- **UI checks return?**: N/A — Success response is explicit.
- **Severity**: OK
- **Issue**: None. Proper transactional semantics: DB insert rolled back on Caddy failure.

---

#### [routes.ts] `update`
- **DB write verified?**: Yes — After update, re-fetches with `await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()` and builds route object.
- **Caddy/downstream verified?**: Yes — Calls `await syncRouteToCaddy(ctx, route)` in try block. On failure, throws TRPCError and logs error.
- **Returns updated record?**: Yes — Returns updated `route` object.
- **UI checks return?**: N/A — Returns full record.
- **Severity**: OK
- **Issue**: None. Read-after-write confirmation present; Caddy sync validated.

---

#### [routes.ts] `delete`
- **DB write verified?**: No — Does not verify delete succeeded (no row count).
- **Caddy/downstream verified?**: Partial — Calls `await ctx.caddy.removeRoute(input.id)` but does NOT wrap in try-catch. If Caddy removal fails, the error propagates and DB delete is never called.
- **Returns updated record?**: No — Returns `{ success: true }` only.
- **UI checks return?**: Yes — Client must check `success: true` field, but success is always returned.
- **Severity**: P2
- **Issue**: If Caddy removal fails, the exception is thrown before DB delete. If Caddy removal succeeds but DB delete fails, neither party is rolled back — DB still has route, Caddy does not. Caller receives `{ success: true }` for a partially successful operation.
- **Fix**: Wrap Caddy removal in try-catch. On Caddy failure, log but continue to DB delete. On DB failure, throw TRPCError. Always wait for both to complete before returning.

---

#### [routes.ts] `toggle`
- **DB write verified?**: Yes — Updates enabled flag, then if enabling, re-fetches and calls `syncRouteToCaddy`.
- **Caddy/downstream verified?**: Yes — If enabling, syncs to Caddy. If disabling, calls `ctx.caddy.removeRoute(input.id)`.
- **Returns updated record?**: No — Returns `{ success: true }` only.
- **UI checks return?**: Yes — Client checks success flag.
- **Severity**: OK
- **Issue**: None. Verification is implicit: if Caddy remove/sync fails, exception is thrown.

---

#### [tenants.ts] `create`
- **DB write verified?**: Yes — ID generated, insert called, returns `{ id }`.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns only `{ id }`.
- **UI checks return?**: N/A — Returns just the ID.
- **Severity**: OK
- **Issue**: None. Simple insert, returns ID for follow-up fetch.

---

#### [tenants.ts] `update`
- **DB write verified?**: No — Does not check if update affected any rows. Uses conditional assignment for fields.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns `{ ok: true }` only.
- **UI checks return?**: No — Success is assumed.
- **Severity**: P2
- **Issue**: If tenant ID does not exist, the update statement runs but affects 0 rows. Caller receives `{ ok: true }` anyway. User thinks update succeeded when it was silently skipped.
- **Fix**: After update, verify at least 1 row was affected. If 0 rows, throw TRPCError. Or re-fetch and return the updated tenant.

---

#### [tenants.ts] `delete`
- **DB write verified?**: No — Does not check deletion succeeded.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns `{ ok: true }` only.
- **UI checks return?**: No — Success is assumed.
- **Severity**: P2
- **Issue**: If tenant ID does not exist, delete statement affects 0 rows. Caller receives `{ ok: true }`. Silent failure.
- **Fix**: Verify deletion affected at least 1 row, or throw TRPCError.

---

#### [accessLists.ts] `create`
- **DB write verified?**: Partial — Inserts accessList, IP rules, auth users, auth config in sequence. No verification after middle steps.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns `{ id }` only.
- **UI checks return?**: N/A
- **Severity**: OK
- **Issue**: None — insertions are sequential; if any fails, exception is thrown. Returns ID for follow-up fetch.

---

#### [accessLists.ts] `update`
- **DB write verified?**: Partial — Verifies existence before, but not after. Updates main record, then deletes/re-inserts IP rules and auth config in sequence.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns `{ success: true }` only.
- **UI checks return?**: No
- **Severity**: P2
- **Issue**: Multi-step operation (update accessList, delete IP rules, insert IP rules, delete auth config, insert auth config). If an insert fails mid-transaction, the list is left with partial rules/config. No rollback. Returns `{ success: true }` regardless.
- **Fix**: Use a database transaction (if driver supports) or verify each step completed. Return the full updated object, not just a boolean.

---

#### [accessLists.ts] `delete`
- **DB write verified?**: Partial — Verifies existence before delete, but not after each delete.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns `{ success: true }` only.
- **UI checks return?**: No
- **Severity**: P2
- **Issue**: Deletes auth config, auth users, IP rules, then access list in sequence. If a middle delete fails, the list record is still deleted but rules/config remain orphaned. No rollback. Returns `{ success: true }`.
- **Fix**: Use a transaction or verify all deletes succeeded. Consider keeping rules/config if deletion of list fails partway.

---

#### [approvals.ts] `setConfig`
- **DB write verified?**: No — Uses `onConflictDoUpdate` without checking if write succeeded.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns `{ ok: true }` only.
- **UI checks return?**: No
- **Severity**: P2
- **Issue**: Insert or update of systemSettings happens blindly. No verification. Returns `{ ok: true }` assuming success.
- **Fix**: After upsert, re-select the row to confirm. If not found, throw TRPCError.

---

#### [approvals.ts] `purgeExpired`
- **DB write verified?**: No — Deletes rows matching a condition, no count verification.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns result of deletion without confirming count.
- **UI checks return?**: No
- **Severity**: P3
- **Issue**: Minor — deletion of old records. No critical data at risk. But operation result is not verified.
- **Fix**: Return count of deleted rows so caller knows if operation ran.

---

#### [caddy.ts] `reload`
- **DB write verified?**: N/A
- **Caddy/downstream verified?**: Partial — Calls `ctx.caddy.reload()` in try-catch, but reload can fail mid-operation (partial route sync). Returns `{ ok: true }` even if some routes failed.
- **Returns updated record?**: No — Returns `{ ok: true }` only.
- **UI checks return?**: No
- **Severity**: P1
- **Issue**: Caddy reload can encounter errors for individual routes but still mark overall reload as "ok: true". Some routes may not be synced. No granular error feedback. User thinks all routes were synced when some failed.
- **Fix**: Capture per-route errors from reload. Return detailed status: `{ ok: boolean, failures: [{ routeId, error }] }`. Fail overall if any critical routes failed.

---

#### [certificates.ts] `check`
- **DB write verified?**: N/A — This is a read-only check operation.
- **Caddy/downstream verified?**: Yes — Queries Caddy for certificate status.
- **Returns updated record?**: N/A — Returns status object.
- **UI checks return?**: N/A
- **Severity**: OK
- **Issue**: None. Read-only query, proper error handling.

---

#### [redirectHosts.ts] `create`
- **DB write verified?**: No — Inserts host without verifying row was created.
- **Caddy/downstream verified?**: No — Does not push to Caddy.
- **Returns updated record?**: No — Returns `{ id }` only.
- **UI checks return?**: N/A
- **Severity**: P3
- **Issue**: Minor — returns ID for follow-up verification. Database insert failure would throw an exception (not a silent failure).
- **Fix**: Verify insert or return full record.

---

#### [streams.ts] `create`
- **DB write verified?**: No — Inserts stream record without count check.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns `{ id }` only.
- **UI checks return?**: N/A
- **Severity**: P3
- **Issue**: Returns only ID. Database error would throw exception, so not silent. Minor issue.
- **Fix**: Return full record.

---

#### [upstreams.ts] `create`
- **DB write verified?**: No — Inserts upstream without verification.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns `{ id }` only.
- **UI checks return?**: N/A
- **Severity**: P3
- **Issue**: Minor — insert errors throw. Returns ID only.
- **Fix**: Return full object.

---

#### [users.ts] `logout`
- **DB write verified?**: Yes — Revokes session token via `ctx.db.delete(sessions)`.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns `{ __setCookie: "...", ok: true }` (auth cookie handling pattern).
- **UI checks return?**: Yes — Client checks `__setCookie` field and uses it to clear auth cookie.
- **Severity**: OK
- **Issue**: None. Proper error handling; returns cookie to clear and success flag.

---

#### [users.ts] `setDashboardSSO`
- **DB write verified?**: No — Upserts systemSettings without verification.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns `{ ok: true }` only.
- **UI checks return?**: No
- **Severity**: P2
- **Issue**: Uses `onConflictDoUpdate` without confirming write. Returns `{ ok: true }` blind.
- **Fix**: Re-select after upsert to verify. Return full config.

---

#### [users.ts] `deleteDashboardSSO`
- **DB write verified?**: No — Deletes row without verification.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns `{ ok: true }` only.
- **UI checks return?**: No
- **Severity**: P2
- **Issue**: Delete not verified. Returns success blind.
- **Fix**: Verify deletion affected a row. Throw TRPCError if not found.

---

#### [integrations.ts] `setInfraOSConfig`, `setLockBoxConfig`, `setPatchOSConfig`
- **DB write verified?**: No — All three upsert systemSettings without verification.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — All return `{ ok: true }` only.
- **UI checks return?**: No
- **Severity**: P2
- **Issue**: Three similar mutations, all blind upserts. Returns success without confirming write.
- **Fix**: Verify upsert. Return full config.

---

#### [observability.ts] `setCTConfig`, `setTraceConfig`
- **DB write verified?**: No — Both upsert systemSettings blind.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Both return `{ ok: true }` only.
- **UI checks return?**: No
- **Severity**: P2
- **Issue**: Blind upsert, no verification. Success assumed.
- **Fix**: Verify and return full object.

---

#### [security.ts] `createFail2banRule`, `purgeExpiredBans`
- **DB write verified?**: No — Insert/delete without count verification.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Return `{ ok: true }` or count without confirming writes.
- **UI checks return?**: No
- **Severity**: P3
- **Issue**: Minor — database errors would throw. Returns don't confirm write.
- **Fix**: Verify writes.

---

#### [networks.ts] `rescanNow`
- **DB write verified?**: N/A — Triggers background scan, does not directly write.
- **Caddy/downstream verified?**: N/A
- **Returns updated record?**: No — Returns `{ started: true }` only.
- **UI checks return?**: No
- **Severity**: P3
- **Issue**: Fire-and-forget background job. No guarantee scan completes or succeeds. Returns "started" which is accurate.
- **Fix**: None needed for fire-and-forget. But track scan status in a separate query endpoint.

---

### Overall Patterns

1. **Blind Returns**: 13 mutations return `{ ok: true }` or `{ success: true }` without verifying the write succeeded. Examples: `tenants.update`, `accessLists.update`, `approvals.setConfig`, all `integration` configs.

2. **Multi-Step Operations Without Transactions**: `accessLists.update` and `accessLists.delete` perform multiple sequential writes (delete rules, insert rules, update config) without rolling back if a middle step fails. If rule insert fails, the access list is updated but rules are incomplete.

3. **Caddy Sync Gaps**: `routes.delete` does not wrap Caddy removal in try-catch. If Caddy removal fails, DB delete is not called, leaving database and Caddy out of sync.

4. **Reload Partial Failures**: `caddy.reload` can silently succeed while individual routes fail. Caller receives `{ ok: true }` with no hint that some routes are not synced.

5. **ID-Only Returns**: Many mutations return only `{ id }` without verifying insert succeeded. This is acceptable if errors throw, but less robust than returning the full record.

### Recommendations

**Critical (P0):**
1. `errorHosts.delete` — Add try-catch around Caddy removal. Decide atomicity order (Caddy-first preferred). No error handling currently means silent DB/Caddy divergence.

**Immediate (P1):**
1. `errorHosts.update` / `toggle` — DB committed before Caddy; add rollback or Caddy-first ordering.
2. `drift.reconcile` — Do not mark event resolved when Caddy push failed; throw or return failure.
3. `system.setForceHttps` — Add try-catch around bare Caddy calls; return DB value not input value.
4. Fix `caddy.reload` to return per-route error details.
5. Wrap `routes.delete` Caddy removal in try-catch.

**This Sprint (P2):**
1. Add row-count verification to `tenants.update` and `tenants.delete`. Throw if 0 rows affected.
2. Refactor `accessLists.update` and `accessLists.delete` to use database transactions (if supported) or verify each step.
3. Verify systemSettings upserts in: `approvals.setConfig`, `integrations.*`, `observability.*`, `users.setDashboardSSO`. Return full object, not just `{ ok: true }`.

**Next Sprint (P3):**
1. Standardize all mutations to return full records, not just `{ id }` or `{ success: true }`.
2. Consider adding a mutation result type that bundles success flag + record + validation errors.

---

### §1B Supplement A — Caddy-Touching Routers (Extended Coverage)

*Audited: drift.ts, errorHosts.ts, patchos.ts, system.ts*

#### [errorHosts.ts] `create`
- **DB write verified?**: Yes — reads back inserted row before returning
- **Caddy/downstream verified?**: Yes — Caddy call wrapped in try-catch; on failure, rolls back DB insert before throwing
- **Returns updated record?**: Yes — returns full `rowToErrorHost(row!)`
- **UI checks return?**: N/A
- **Severity**: OK
- **Issue**: None.
- **Fix**: N/A

---

#### [errorHosts.ts] `update`
- **DB write verified?**: Yes — reads back row after update
- **Caddy/downstream verified?**: Partial — Caddy call wrapped in try-catch, but DB write is already committed before Caddy call. On Caddy failure, DB and Caddy diverge; no rollback.
- **Returns updated record?**: Yes — returns fetched updated row
- **UI checks return?**: N/A
- **Severity**: P1
- **Issue**: DB committed before Caddy update. Caddy failure leaves DB and Caddy out of sync; user sees error but data in DB has changed.
- **Fix**: Execute Caddy call before committing DB update, or add compensating DB rollback in the catch block.

---

#### [errorHosts.ts] `delete`
- **DB write verified?**: No — delete runs without row-count check
- **Caddy/downstream verified?**: No — Caddy removal call is bare (no try-catch). If it throws, DB delete never executes. If order reversed, Caddy failure after DB delete would leave orphaned Caddy route.
- **Returns updated record?**: No — returns `{ success: true }` only
- **UI checks return?**: N/A
- **Severity**: P0
- **Issue**: No error handling on Caddy call. Depending on failure mode, either Caddy has a route with no DB record, or DB has no record but Caddy still serves it. Silent data inconsistency.
- **Fix**: Wrap Caddy call in try-catch. Decide on atomicity order: prefer Caddy-first (remove from Caddy, then DB); if Caddy fails, throw before touching DB.

---

#### [errorHosts.ts] `toggle`
- **DB write verified?**: No — update runs without row-count check
- **Caddy/downstream verified?**: Partial — enable path has try-catch but no rollback; disable path has no try-catch at all. DB is written first in both cases.
- **Returns updated record?**: No — returns `{ success: true }` only
- **UI checks return?**: N/A
- **Severity**: P1
- **Issue**: DB updated first, then Caddy. Any Caddy failure leaves them out of sync. Disable path especially risky — no error handling means an unhandled exception propagates with DB already committed.
- **Fix**: Add try-catch to the disable Caddy path. Prefer Caddy-first ordering or add rollback logic.

---

#### [drift.ts] `reconcile`
- **DB write verified?**: No — `ctx.db.update()` called without row-count verification
- **Caddy/downstream verified?**: Partial — Caddy call is try-caught, but catch logs and continues, marking the drift event as resolved even if Caddy push failed
- **Returns updated record?**: No — returns `{ success: true }` only
- **UI checks return?**: N/A
- **Severity**: P1
- **Issue**: If Caddy reconciliation fails, drift event is still marked resolved in DB. Caddy drift is effectively silently ignored. User believes reconciliation succeeded.
- **Fix**: On Caddy failure, do not mark event resolved. Return `{ success: false, error: ... }` or throw TRPCError so the UI can display the failure.

---

#### [patchos.ts] `setMaintenance`, `restore`, `setMaintenanceExternal`, `restoreExternal`
- **DB write verified?**: Yes — DB updates read back before Caddy calls
- **Caddy/downstream verified?**: Partial — intentional loose coupling; comments note "Caddy sync failure is non-fatal — maintenance flag is set in DB." This is a deliberate design choice.
- **Returns updated record?**: No — all four return `{ ok: true }` only
- **UI checks return?**: N/A
- **Severity**: P2
- **Issue**: Intentional pattern, documented in comments. However, if Caddy sync silently fails, the maintenance page may not actually appear to users visiting the route despite the DB flag being set.
- **Fix**: Consider returning `{ ok: true, caddySynced: boolean }` so UI can show a "sync pending" warning when Caddy push failed.

---

#### [system.ts] `setForceHttps`
- **DB write verified?**: No — upsert runs without read-back to verify persistence
- **Caddy/downstream verified?**: No — Caddy calls are bare (no try-catch). If either fails, DB write is already committed. No rollback.
- **Returns updated record?**: No — returns `{ enabled: input.enabled }` (the input, not the stored value)
- **UI checks return?**: N/A
- **Severity**: P1
- **Issue**: Caddy calls have zero error handling. DB committed before Caddy. Any Caddy failure silently diverges state. Returning input instead of DB-stored value means phantom save is possible (UI shows user's input; DB may have stored something different due to constraint or type coercion).
- **Fix**: Wrap Caddy calls in try-catch; throw on failure before or with rollback. Read back the DB setting and return it rather than returning the input value.

---

### §1B Supplement B — Remaining DB-Only Routers (Pattern Summary)

The following 33 router files contain mutations but have **no Caddy API calls** — they operate exclusively on the database. Full per-mutation audit is in the low-priority backlog; pattern-level summary follows.

**Routers scanned:** accessos.ts, agents.ts, alerts.ts, apiKeys.ts, automation.ts, backupConfig.ts, billing.ts, chain.ts, connections.ts, ddns.ts, discovery.ts, dns.ts, importers.ts, infraos.ts, intelligence.ts, lockboxos.ts, monitors.ts, mxwatch.ts, nodes.ts, notifications.ts, oauthProviders.ts, organizations.ts, routeVersions.ts, scanner.ts, scheduledChanges.ts, secretsProviders.ts, sites.ts, sso.ts, systemLog.ts, tags.ts, templates.ts, trafficReplay.ts, tunnelProviders.ts, waf.ts

**Pattern findings (grepped, not individually audited):**
- **81 instances** of `return { ok: true }` or `return { success: true }` in mutation handlers — mutations complete without returning the stored record, making phantom-save detection impossible from the client side
- **No Caddy interaction** — DB+Caddy sync risk is absent for these routers
- **Severity for bulk pattern: P3** — unconventional (not idiomatic tRPC) but not a data loss risk when no external sync is required

**Recommendation:** Add a Phase 2 sweep to standardize these mutations to return the post-write record. Not a blocking stability issue.


---

## §1C — Container Rebuild Scenarios

### Summary
- Total scenarios analysed: 25 (5 integrations × 5 scenarios each)
- P0: 3 | P1: 8 | P2: 7 | P3: 5 | OK: 3
- **Note:** `packages/caddy/src/resolve-upstream.ts` referenced in CLAUDE.md as locked does not exist in the repo. Upstream resolution logic is in `config.ts`. The static-IP upstream finding is grounded in `config.ts` and `docker-discovery.ts` instead.

### Integration: Cloudflared → ProxyOS

| Scenario | What Breaks | Severity | Recovery |
|----------|-------------|----------|----------|
| ProxyOS recreated (new IP) | DNS tunnel disconnects; Cloudflare loses route to ProxyOS | P0 | Cloudflared container must re-establish tunnel; may take 30-60s. During window, users cannot reach ProxyOS via tunnel. |
| Sibling container (Cloudflared) recreated | Upstream change (if ProxyOS proxies Cloudflared API) | P3 | Container name resolution auto-heals via Docker DNS once Cloudflared restarts. No manual action. |
| Host reboot | DNS tunnel drops until both containers restart | P1 | Requires `restart: unless-stopped` in docker-compose.yml (present). On host reboot, Docker daemon restarts, Cloudflared reconnects, ProxyOS continues serving local routes. Downstream: ~2 minute recovery window. |
| Docker volume pruned | No persistent state — tunnel credentials not on volume | OK | Cloudflared credentials are environment-injected; no volume dependency. Tunnel persists across prune. |
| New image pulled (`:latest` tag) | Tunnel binary may change; behaviour depends on Cloudflare version | P2 | Risk: Cloudflared v X.Y breaks compatibility with ProxyOS; tunnel fails to establish. Mitigation: pin Cloudflared to specific version in docker-compose.yml rather than `:latest`. |

#### Findings

**P0 Issue: ProxyOS IP changes on container recreate, Cloudflared loses route**
- Cloudflared tunnel endpoint points to `http://proxyos:3000` (container name, resolved via Docker DNS)
- When ProxyOS container is recreated, Docker assigns a new IP to the container
- Cloudflared's cached DNS entry stales; tunnel may send traffic to old IP briefly
- **Fix**: None needed for Cloudflared → ProxyOS direction (Docker DNS eventually heals). However, document that during ProxyOS downtime, the tunnel is unreachable. Implement HTTP liveness endpoint on Cloudflared side to detect ProxyOS unavailability faster.

**P1 Issue: Host reboot leaves tunnel down for ~2 minutes**
- ProxyOS has `restart: unless-stopped` (good)
- Cloudflared container (if external) may have different restart policy
- If Cloudflared is a separate container with no restart policy, host reboot leaves it stopped until manual intervention
- **Fix**: Ensure Cloudflared also has `restart: unless-stopped` in docker-compose.yml (if ProxyOS controls it). If Cloudflared is external (managed elsewhere), document the recovery window.

**P2 Issue: Image tag `:latest` can introduce compatibility breaks**
- Cloudflared binary updates can change tunnel protocol or certificate validation
- ProxyOS has no version pinning for Cloudflared
- **Fix**: Pin Cloudflared image to a specific version (e.g., `cloudflare/cloudflared:2026.4.0`) in docker-compose.yml. Test upgrades in staging before deploying.

---

### Integration: ProxyOS → Upstream Containers

| Scenario | What Breaks | Severity | Recovery |
|----------|-------------|----------|----------|
| ProxyOS recreated | Routes still exist in DB; upstreams (container names) resolve to new ProxyOS IP if ProxyOS was upstream | P3 | Caddy config is regenerated at startup from routes in DB. No upstream breakage unless ProxyOS itself is an upstream (uncommon). |
| Sibling container recreated (upstream) | If upstream is static IP: route fails. If upstream is container name: resolves to new IP automatically. | P1 | Docker DNS resolves container names dynamically. Caddy health check (if enabled) detects dead upstream, removes from rotation. Manual fix: update upstream address if static IP was used. |
| Host reboot | All containers restart; routes regenerated from DB on ProxyOS startup | OK | `restart: unless-stopped` ensures containers restart. Caddy re-applies routes from DB during bootstrap. Zero route loss (routes persist on volume). |
| Docker volume pruned | Routes are lost (stored in SQLite on proxyos-data volume) | P0 | **CRITICAL**: User loses all routes. Data is unrecoverable. New container has empty route table. Mitigation: regular backups of `proxyos-data` volume. |
| New image pulled (`:latest` tag) | Caddy binary may change; route config format may break | P2 | Risk: New Caddy version doesn't understand old route config format; routes fail to load. Mitigation: pin Caddy to specific version in Dockerfile or wrap in version-locked base image. Test major Caddy upgrades in staging first. |

#### Findings

**P0 Issue: Docker volume prune deletes all routes**
- Routes are stored in SQLite database on `proxyos-data` volume
- No replication, no backup, no off-volume copy
- If user runs `docker volume prune` (which removes unused volumes), all routes are deleted permanently
- **Fix**: Implement automated daily volume snapshots (e.g., via cron in host) or document in setup that `proxyos-data` is critical and should NOT be pruned. Consider warning banner in UI: "Critical data: routes are stored on docker volume 'proxyos-data'. Do not prune."

**P1 Issue: Static IP upstreams break on container recreate; dynamic container names auto-heal**
- Evidence: `docker-discovery.ts` uses container name for upstream (`upstreamUrl = \`http://${containerName}:${port}\``)
- If user manually entered a static IP (e.g., `192.168.1.100:8080`), Caddy caches the IP
- When the upstream container is recreated, the old IP is stale; Caddy continues dialing the dead IP
- Health check can detect failure but doesn't automatically switch to new IP if the container name is unknown
- **Fix**: Encourage users to configure upstreams by container name (via docker-discovery) rather than static IP. Document: "Use container names for upstreams so they auto-heal on container restart."

---

### Integration: ProxyOS → Caddy Admin API

| Scenario | What Breaks | Severity | Recovery |
|----------|-------------|----------|----------|
| ProxyOS recreated | Caddy continues running; ProxyOS reconnects to localhost:2019 on startup | OK | Caddy and ProxyOS are in the same container; restart is atomic. If Caddy crashes separately, ProxyOS can't reach it and logs warning at startup. |
| Sibling container (Caddy) recreated | N/A — Caddy is not a separate container | OK | Caddy is embedded in same container via s6-overlay. No separate container lifecycle. |
| Host reboot | Caddy stops; proxyos-data and caddy-data volumes preserve config | P2 | On restart, ProxyOS starts → s6 spawns Caddy → ProxyOS connects to Caddy admin API and reloads routes. Transient downtime while s6 waits for services to become ready (~5-10s). |
| Docker volume pruned | caddy-data and caddy-config volumes deleted; Caddy loses in-memory certificate cache and config | P1 | Caddy can regenerate config from memory or ProxyOS DB, but certificate cache is lost. ACME challenge may be needed again for each domain. Users may see certificate warnings during re-issuance. Recovery: manual cert pre-warm or wait for ACME refresh. |
| New image pulled (`:latest` tag) | Caddy binary may have breaking changes in admin API or config format | P2 | Risk: ProxyOS calls Caddy admin API with v2 JSON format; new Caddy expects v3 JSON. Calls fail silently or with unclear errors. Mitigation: pin Caddy version in Dockerfile (baseimage or explicit Caddy download). |

#### Findings

**P2 Issue: Host reboot causes brief downtime during s6 service startup**
- ProxyOS and Caddy start in parallel via s6-overlay; startup order is best-effort
- If Caddy is slow to bind to `localhost:2019`, ProxyOS's first `POST /config` call may fail
- Current code: `bootstrapCaddy` has timeout but no retry loop
- Evidence: `instrumentation.node.ts` warns "Caddy not reachable at boot" but continues
- **Fix**: Add exponential backoff retry in `bootstrapCaddy` (up to 30s) before failing. Alternately, ensure Caddy has `ready` check in s6 config (if using readiness gates).

**P1 Issue: caddy-data volume prune forces re-issuance of all ACME certificates**
- Caddy stores issued certificates and ACME state in `caddy-data`
- On volume prune, all certs are deleted
- On next ProxyOS startup, any TLS-enabled domain triggers new ACME challenge
- If ACME account is rate-limited, some domains may fail to renew
- **Fix**: Add UI warning "caddy-data volume is critical; do not prune without backup." Implement automated ACME state backup or store certs in DB instead of volume.

---

### Integration: ProxyOS → SQLite

| Scenario | What Breaks | Severity | Recovery |
|----------|-------------|----------|----------|
| ProxyOS recreated | DB file persists on proxyos-data volume; new container connects to same DB | OK | All routes, users, settings remain. Container restart is stateless from DB perspective. |
| Sibling container (DB) recreated | N/A — SQLite is not a separate container | OK | SQLite DB file is local to ProxyOS; no separate container. If ProxyOS is recreated, same DB file is used. |
| Host reboot | DB file is preserved on volume; ProxyOS reconnects on startup | OK | SQLite handles abrupt disconnects gracefully (journal recovery). No data loss. |
| Docker volume pruned | proxyos-data volume deleted; all routes, users, DNS records lost | P0 | **CRITICAL**: Complete data loss. Unrecoverable without external backup. All ProxyOS state is gone. |
| New image pulled (`:latest` tag) | SQLite schema may be incompatible; migrations may fail or corrupt DB | P1 | Risk: New code attempts schema migration; migration fails halfway due to bug or backwards-incompatibility. DB is left in inconsistent state. Mitigation: test migrations in staging. Keep DB file in consistent state (no long-running transactions when shutting down). |

#### Findings

**P0 Issue: Volume prune causes total data loss**
- Evidence: `proxyos-data:/data/proxyos` volume holds SQLite file
- No replication, no off-site backup
- `docker volume prune` removes the volume without confirmation
- Users lose all routes, users, DNS records, federation identity
- **Fix**: Implement automated daily backup of proxyos-data to S3 or similar. Add UI banner: "Critical: All ProxyOS data is stored on Docker volume 'proxyos-data'. Enable automatic backups in Settings > System."

**P1 Issue: Schema migrations may leave DB in inconsistent state**
- Evidence: `packages/db/src/migrations.ts` has no transaction wrapping
- If a migration runs halfway (e.g., new column added, then process crashes before updating existing rows), DB state is inconsistent
- Next startup may fail or behave unpredictably
- **Fix**: Wrap all migrations in explicit transactions. If a migration fails, rollback the entire batch. Log migration version and timestamp to DB so failures can be diagnosed.

---

### Integration: Federation Agent → Central

| Scenario | What Breaks | Severity | Recovery |
|----------|-------------|----------|----------|
| ProxyOS agent recreated | Identity file (identity.json) is lost; agent must re-enroll with central | P1 | Agent starts, finds no identity file, attempts enrollment with PROXYOS_AGENT_TOKEN. If token is valid, new identity is issued and config cache is applied. Brief gap where agent is unconfigured (no routes from central). |
| Central node recreated | Agent loses WebSocket connection; reconnects with exponential backoff | P2 | Agent attempts reconnect every `PROXYOS_RECONNECT_DELAY` (default 1s) up to `PROXYOS_MAX_RECONNECT_DELAY` (default 60s). During disconnection, agent keeps serving routes from config-cache.json. No routes from central are applied until reconnect. |
| Host reboot | Both agent and central restart; agent re-establishes WebSocket connection | OK | Agent and central both have `restart: unless-stopped`. Agent's identity.json persists on volume. Central's federation state is in-memory (no persistence). On agent reconnect, central pushes cached config. |
| Docker volume pruned | identity.json is deleted; agent cannot identify itself to central | P1 | Agent restarts, finds no identity.json, attempts enrollment with PROXYOS_AGENT_TOKEN. If token is revoked or invalid, enrollment fails; agent logs fatal error and exits. Manual recovery: regenerate token or restore identity.json from backup. |
| New image pulled (`:latest` tag) | Federation protocol version may change; agent/central handshake may fail | P2 | Risk: Agent sends protocol v1 Hello; central expects v2 and rejects. Disconnection loop. Mitigation: version federation protocol; add graceful fallback or error logs. Ensure agent and central images are updated together (not independently). |

#### Findings

**P1 Issue: Agent loses identity on container recreate; re-enrollment may fail if token is revoked**
- Evidence: `FederationClient.start()` checks for identity.json; if missing, calls `enroll()` with PROXYOS_AGENT_TOKEN
- Token must be valid and enrolled with central
- If token is revoked or expired, enrollment fails; agent logs fatal error and exits
- User must manually fix token or restore identity.json from backup
- **Fix**: Add exponential backoff to enrollment attempts (retry up to 5 times with delays). If all attempts fail, log clear error message: "Agent enrollment failed. Check PROXYOS_AGENT_TOKEN and central availability." Consider keeping stale identity.json as fallback (with warning).

**P2 Issue: Central node recreation causes temporary loss of new route pushes**
- Evidence: `client.ts` caches last applied config version; if central is recreated, in-memory state is lost
- Central must re-send all routes to all agents
- Risk: During central startup, agents don't know which routes to serve; may serve stale routes or miss new routes
- **Fix**: Implement central-side persistence of route state (in a volume-backed DB or queue). On startup, central replays pending config updates to all connected agents.

**P2 Issue: Unversioned federation protocol can cause handshake failure on image upgrade**
- Evidence: `protocol.ts` defines FederationMessage types; no explicit version field
- If new image adds a new message type or changes existing field semantics, old agents won't understand
- **Fix**: Add `protocol_version: '1'` field to every FederationMessage. Implement agent-side version negotiation in HelloMessage. If version mismatch, log clear error and attempt graceful downgrade or disconnect with reason.

---

### Cross-Cutting Issues

#### Issue 1: Container IP changes are not propagated to external DNS (DDNS)

**Evidence**: `ddns-updater.ts` polls public IP every 60s; updates DNS records if IP changes. However, ProxyOS IP address in Docker is internal (172.17.x.x range) and is not exposed to DDNS.

**Impact**: If Cloudflared tunnel points to a hostname (not IP), and that hostname is managed by DDNS, the hostname may resolve to a stale external IP if ProxyOS container IP was the source of truth for DDNS.

**Severity**: P2

**Fix**: Document that DDNS must use the host's public IP (detected via external service like my-ip.io), not the container's internal IP. Current code is correct but misleading if users assume DDNS tracks ProxyOS container IP.

---

#### Issue 2: No atomic volume snapshots for backup

**Evidence**: `proxyos-data`, `caddy-data`, `caddy-config` volumes have no snapshot/backup mechanism.

**Impact**: Users are one `docker volume prune` away from total data loss. No recovery path.

**Severity**: P0

**Fix**: Implement automated daily snapshots of all three volumes:
- Option A: Use Docker volume driver with snapshot support (e.g., NFS, ZFS)
- Option B: Periodically tar volumes to external storage (S3, NFS share)
- Option C: Implement in-app backup/restore UI that exports DB + certs to tarball

---

#### Issue 3: No graceful shutdown on container recreation

**Evidence**: Caddy and ProxyOS processes may be killed mid-request on container stop.

**Impact**: In-flight requests are dropped; clients see connection resets. No time for cleanup (e.g., flushing logs, closing DB connections).

**Severity**: P2

**Fix**: Add graceful shutdown handler:
- Set `stop_grace_period: 30s` in docker-compose.yml
- Add SIGTERM handler in ProxyOS and Caddy that closes listeners, waits for in-flight requests to complete (up to 30s), then exits
- Log all graceful shutdown events so users can see downtime window in audit

---

### Recommendations

1. **P0 - Enable volume backups immediately**: Daily snapshots of `proxyos-data`, `caddy-data` to external storage (S3 recommended). Test restore path monthly.

2. **P1 - Pin container image versions**: Remove `:latest` tags from Dockerfile and docker-compose.yml. Use specific versions (e.g., `caddy:2.8.4`, `cloudflare/cloudflared:2026.4.0`). Test minor version upgrades in staging before deploying.

3. **P1 - Wrap schema migrations in transactions**: All new migrations must use explicit BEGIN TRANSACTION / COMMIT. Add migration version tracking to DB.

4. **P2 - Implement graceful container shutdown**: Add SIGTERM handlers with 30s grace period. Add stop_grace_period to docker-compose.yml.

5. **P2 - Add federation protocol versioning**: Introduce `protocol_version` field to all FederationMessage types. Implement version negotiation in HelloMessage.

6. **P3 - Document upstream best practices**: Encourage users to reference upstreams by container name (auto-healing on recreate) rather than static IP. Add UI hint: "For container upstreams, use container name (e.g., 'myapp') instead of IP for automatic recovery on restart."

---

## §1D — Environment Variable Inventory

### Summary
- Total env vars found: 46
- P0: 2 | P1: 3 | P2: 3 | P3: 3 | OK: 17

### Inventory

#### `PROXYOS_SECRET`
- **Used in**: `packages/api/src/auth.ts:7` (session signing), `packages/api/src/crypto.ts:15` (AES-GCM encryption/decryption), `packages/api/src/apiKeyAuth.ts:8` (API key HMAC hashing)
- **Default**: None — required
- **If unset**: `auth.ts` calls `process.exit(1)` at module load (unless `NEXT_PHASE=phase-production-build`). `crypto.ts` and `apiKeyAuth.ts` throw at call-time.
- **If invalid**: Values shorter than 32 chars produce a console warning but do not halt. Known-weak values (`changeme`, `secret`, etc.) call `process.exit(1)`.
- **Restart-safe?**: No — changing this value between restarts invalidates all existing session tokens (users get logged out) and breaks decryption of all API keys and encrypted fields stored in the DB. Existing `enc:v1:` and `enc:v2:` blobs become permanently unreadable.
- **Severity**: P0
- **Issue**: Rotating `PROXYOS_SECRET` silently corrupts all encrypted data and invalidates all sessions with no migration path. The `crypto.ts` plaintext fallback path (`console.warn` + return value) means corrupted decryptions produce garbage rather than an error, which could surface as silent wrong behaviour.
- **Fix**: Document that `PROXYOS_SECRET` is immutable after first run. Add a startup check that attempts to decrypt a known sentinel value from the DB; if decryption fails, refuse to start and log a clear key-rotation warning.

#### `PROXYOS_JWT_SECRET`
- **Used in**: `packages/api/src/routers/agents.ts:10`
- **Default**: `'proxyos-dev-secret-change-in-production'` (hardcoded fallback)
- **If unset**: Falls back silently to the well-known dev value. All agent JWTs signed with the dev secret are trivially forgeable.
- **If invalid**: No validation — any string accepted.
- **Restart-safe?**: No — changing between restarts invalidates all issued agent tokens.
- **Severity**: P0
- **Issue**: Hardcoded fallback is a security hole in production. Unlike `PROXYOS_SECRET`, there is no startup exit or warning. A production container deployed without this variable silently accepts forged agent tokens.
- **Fix**: Apply the same `process.exit(1)` guard pattern used in `auth.ts`. Remove the fallback or replace it with a startup crash.

#### `PROXYOS_DB_PATH`
- **Used in**: `packages/db/src/index.ts:11`, `packages/db/drizzle.config.ts:6`, `packages/api/src/routers/integrations.ts:89`
- **Default**: `resolve(process.cwd(), 'data/proxyos.db')` in db package; `'./proxyos.db'` in integrations router (inconsistent)
- **If unset**: Falls back to different paths in different call sites — the DB module and the integrations router resolve different default paths, which means the integrations backup/export router may open a different (possibly empty) database than the main app.
- **If invalid**: SQLite will create a new empty file at the path, resulting in an empty DB rather than an error.
- **Restart-safe?**: Yes — path change takes effect on next open, but changing it without moving the file loses all data.
- **Severity**: P1
- **Issue**: Inconsistent default between `packages/db/src/index.ts` (`data/proxyos.db` relative to cwd) and `packages/api/src/routers/integrations.ts` (`./proxyos.db`). In production (cwd may differ), these could resolve to different files, causing the integrations export to silently operate on an empty DB.
- **Fix**: Centralise the default into a single exported constant in `packages/db` and import it in the integrations router.

#### `CADDY_ADMIN_URL`
- **Used in**: `packages/caddy/src/client.ts:33`, `packages/caddy/src/wait-ready.ts:11`, `packages/api/src/routers/caddy.ts:37`, `packages/api/src/routers/certificates.ts:93,121,140`, `apps/web/src/app/api/v1/[[...slug]]/route.ts:187`, `apps/agent/src/caddy-sync.ts:3`, `apps/agent/src/health.ts:3`
- **Default**: `'http://localhost:2019'`
- **If unset**: Falls back to localhost — correct for single-container deployments. If Caddy moves to a separate container without setting this var, all route pushes silently fail or hit the wrong host.
- **If invalid**: HTTP fetch errors at call-time; Caddy operations fail with network errors.
- **Restart-safe?**: Yes.
- **Severity**: OK
- **Issue**: None for standard single-container use. Low risk that a multi-container deployment forgets to set it.

#### `PROXYOS_INTERNAL_URL`
- **Used in**: `packages/caddy/src/config.ts:58` (bot-challenge verify URI injected into Caddy route config)
- **Default**: `'http://localhost:3000'`
- **If unset**: Falls back to localhost — correct for single-container. If the Next.js app is on a different host/port, bot-challenge verification requests from Caddy will fail, breaking bot-protection for all routes that have it enabled.
- **If invalid**: Caddy will build a route with an unreachable verify URI; the route will be created but bot-challenge will always fail/timeout.
- **Restart-safe?**: Yes — takes effect on next route push.
- **Severity**: P2
- **Issue**: No documentation that this must be set in non-localhost deployments (e.g., Kubernetes, split-container Docker). Misconfiguration is silent: routes get created, but bot-challenge silently fails.
- **Fix**: Log a startup warning if `PROXYOS_INTERNAL_URL` is the default and bot-challenge is in use, suggesting the user verify the value is reachable from Caddy.

#### `PROXYOS_COOKIE_SECURE`
- **Used in**: `packages/api/src/auth.ts:29`
- **Default**: None — auto-detected from `x-forwarded-proto` header or request URL protocol
- **If unset**: Falls back to protocol detection. On HTTP-only homelab setups behind a reverse proxy that doesn't forward `x-forwarded-proto`, `Secure` may be incorrectly omitted or set.
- **If invalid**: Any value other than `'true'` or `'false'` falls through to auto-detection (silent).
- **Restart-safe?**: Yes.
- **Severity**: OK
- **Issue**: Auto-detection is reasonable. Typos in the value (e.g., `TRUE`, `1`) silently fall through to auto-detect rather than erroring.
- **Fix**: Add explicit check: if the env var is set but not `'true'` or `'false'`, log a startup warning listing accepted values.

#### `DATABASE_URL`
- **Used in**: Not used — codebase uses `PROXYOS_DB_PATH` instead. The spec named `DATABASE_URL` as a mandatory env var to audit; this note records that it is absent from the codebase.
- **Default**: N/A
- **If unset**: N/A
- **If invalid**: N/A
- **Restart-safe?**: N/A
- **Severity**: OK
- **Issue**: None — `PROXYOS_DB_PATH` is the correct variable. The CLAUDE.md spec reference to `DATABASE_URL` appears to be a documentation error.
- **Fix**: Update spec/CLAUDE.md to reference `PROXYOS_DB_PATH` instead of `DATABASE_URL`.

#### `NODE_ENV`
- **Used in**: `apps/web/src/instrumentation.node.ts:13` (gates startup validation), `apps/web/src/app/docs/_lib/docs.ts:6` (filesystem vs. bundled docs path)
- **Default**: Set by Next.js; `'development'` in dev, `'production'` in built image
- **If unset**: Next.js defaults to `'development'`. Startup secret validation may be skipped.
- **If invalid**: No validation.
- **Restart-safe?**: Yes.
- **Severity**: OK

#### `METRICS_TOKEN`
- **Used in**: `apps/web/src/app/api/metrics/route.ts:8`
- **Default**: None — optional
- **If unset**: The `/api/metrics` Prometheus endpoint is served **unauthenticated** to any caller. The guard is `if (token) { ... }` — no token means no auth check.
- **If invalid**: No validation.
- **Restart-safe?**: Yes.
- **Severity**: P2
- **Issue**: Unset `METRICS_TOKEN` exposes Prometheus metrics (route counts, system info) to unauthenticated callers on the network. This is a passive information disclosure — not a direct auth bypass, but undesirable in production.
- **Fix**: Either require the token (crash if unset in production) or document clearly that the endpoint is open by default and recommend setting it in docker-compose.

#### `LEMONSQUEEZY_WEBHOOK_SECRET`
- **Used in**: `apps/web/src/app/api/billing/webhook/route.ts:19`
- **Default**: `''` (empty string fallback)
- **If unset**: Webhook signature verification runs against an empty-string secret. An attacker can forge billing webhook payloads by computing HMAC with an empty key.
- **If invalid**: No validation.
- **Restart-safe?**: Yes.
- **Severity**: P1
- **Issue**: Empty-string fallback means billing webhooks are unauthenticated if the env var is not set. A forged webhook could grant a user a paid tier without payment.
- **Fix**: Replace `?? ''` with a startup crash if `HOMELABOS_PRODUCT` / billing is active. At minimum add a warning log if the secret is empty.

#### `LEMONSQUEEZY_API_KEY`
- **Used in**: `packages/billing/src/client.ts:4`
- **Default**: None — throws at call-time if unset
- **If unset**: Billing API calls throw `Error('LEMONSQUEEZY_API_KEY is not set')` — surfaces as a 500 to the user when they visit billing pages.
- **If invalid**: LemonSqueezy API returns 401; error propagates to caller.
- **Restart-safe?**: Yes.
- **Severity**: P1
- **Issue**: Error is thrown at call-time (not startup), so the system starts fine but billing pages crash at runtime with an unguarded error.
- **Fix**: Add a startup warning if billing-related env vars are absent, so the operator knows before a user hits the billing page.

#### `LEMONSQUEEZY_STORE_ID`
- **Used in**: `packages/billing/src/checkout.ts:16`
- **Default**: None — throws at call-time if unset
- **If unset**: Checkout flow throws `Error('LEMONSQUEEZY_STORE_ID is not set')` — 500 on checkout attempt.
- **Restart-safe?**: Yes.
- **Severity**: OK (same pattern as API_KEY — call-time throw is acceptable, already documented above)

#### `CLOUDFLARE_API_TOKEN`
- **Used in**: `packages/caddy/src/bootstrap.ts:97`
- **Default**: None — optional
- **If unset**: Cloudflare DNS challenge is skipped; ACME falls back to HTTP challenge.
- **If invalid**: Caddy ACME request fails; certificate issuance fails for domains requiring DNS challenge.
- **Restart-safe?**: Yes.
- **Severity**: OK

#### `PROXYOS_MODE`
- **Used in**: `packages/api/src/routers/system.ts:15`, `apps/web/src/instrumentation.node.ts:55,58`
- **Default**: `'standalone'`
- **If unset**: Falls back to `'standalone'`. If `PROXYOS_CENTRAL_URL` and `PROXYOS_AGENT_TOKEN` are both set without `PROXYOS_MODE`, instrumentation auto-infers `'node'` mode (line 58). This implicit promotion is undocumented.
- **Restart-safe?**: Yes — mode change takes effect on restart.
- **Severity**: P3
- **Issue**: Implicit mode promotion from env var combination is surprising — operator may not realise the instance has become a federation node.
- **Fix**: Log a clear message when implicit promotion occurs (already partially done at line 58, but worth confirming the log level is at least `warn`).

#### `PROXYOS_CENTRAL_URL` / `PROXYOS_AGENT_TOKEN` / `PROXYOS_AGENT_NAME`
- **Used in**: `apps/web/src/instrumentation.node.ts:81-83`
- **Default**: `PROXYOS_AGENT_NAME` defaults to `os.hostname()`; others have no default
- **If unset**: Federation client not started; node operates standalone.
- **If invalid**: WebSocket connection fails; federation client enters retry loop.
- **Restart-safe?**: Yes.
- **Severity**: OK

#### `PROXYOS_FEDERATION_PORT` / `PROXYOS_FEDERATION_URL`
- **Used in**: `apps/web/src/instrumentation.node.ts:68`, `packages/api/src/routers/nodes.ts:43-45`, `apps/web/src/app/api/federation/enroll/route.ts:73-75`
- **Default**: Port `7890`; URL derived from `PROXYOS_PUBLIC_URL` if not set
- **If unset**: Federation server binds to default port; enrollment URL falls back to `PROXYOS_PUBLIC_URL`-derived WebSocket URL.
- **Restart-safe?**: Yes.
- **Severity**: OK

#### `PROXYOS_PUBLIC_URL`
- **Used in**: `packages/api/src/routers/nodes.ts:44`, `apps/web/src/app/api/federation/enroll/route.ts:74`
- **Default**: None — optional
- **If unset**: Federation enrollment URL is undefined; nodes cannot self-register.
- **Restart-safe?**: Yes.
- **Severity**: OK (only matters in `'central'` mode)

#### `PROXYOS_TLS_SKIP_VERIFY`
- **Used in**: `apps/web/src/instrumentation.node.ts:85`
- **Default**: `false`
- **If set to `'true'`**: TLS certificate verification is disabled for federation connections — acceptable for internal networks, dangerous if forgotten in production.
- **Restart-safe?**: Yes.
- **Severity**: P3
- **Issue**: No warning logged when TLS verification is disabled, making it easy to forget this is set.
- **Fix**: Log a prominent warning at startup if `PROXYOS_TLS_SKIP_VERIFY=true`.

#### `PROXYOS_CA_CERT`
- **Used in**: `apps/web/src/instrumentation.node.ts:84`
- **Default**: None — optional
- **If unset**: System CA bundle used for federation TLS.
- **If invalid**: If the value is not a valid PEM certificate, TLS connections to the federation central will fail with an opaque error at connection time.
- **Restart-safe?**: Yes.
- **Severity**: OK
- **Fix**: None needed — optional var with clear failure mode at connection time.

#### Path/log env vars (group)
`CADDY_BASE_CONFIG_PATH`, `CADDY_LOG_PATH`, `PROXYOS_ACCESS_LOG`, `PROXYOS_CADDY_LOG`, `PROXYOS_CONFIG_CACHE`, `PROXYOS_DOCS_PATH`, `PROXYOS_IDENTITY_PATH`
- **Default**: All have sane filesystem defaults under `/data/proxyos/` or `/tmp/`
- **If unset**: Use defaults — correct for the Docker image layout.
- **If invalid**: File not found or permission error at call-time.
- **Restart-safe?**: Yes.
- **Severity**: OK

#### Timing/retry env vars (group)
`PROXYOS_HEARTBEAT_INTERVAL`, `PROXYOS_RECONNECT_DELAY`, `PROXYOS_MAX_RECONNECT_DELAY`, `PROXYOS_WELCOME_TIMEOUT`
- **Default**: 30s heartbeat, 1s initial reconnect, 60s max reconnect, 30s welcome timeout
- **If unset**: Defaults used — no impact.
- **If invalid**: `Number()` of a non-numeric value produces `NaN`; no validation. `NaN` used as a timer interval causes immediate/infinite firing depending on the runtime.
- **Restart-safe?**: Yes.
- **Severity**: P3
- **Issue**: `Number(process.env.PROXYOS_HEARTBEAT_INTERVAL ?? 30)` — if someone sets `PROXYOS_HEARTBEAT_INTERVAL=''`, `Number('')` is `0`, causing a 0ms heartbeat loop.
- **Fix**: Parse and validate with a minimum value check; fall back to default if `NaN` or `<= 0`.

#### Informational env vars (group)
`PROXYOS_VERSION`, `CADDY_VERSION`, `PROXYOS_TIER`, `NEXT_PUBLIC_PROXYOS_TIER`, `HOMELABOS_PRODUCT`, `PROXYOS_DASHBOARD_PORT`, `TRIAL_DAYS`, `BILLING_SUCCESS_URL`, `BILLING_CANCEL_URL`, `BACKUPOS_WEBHOOK_URL`, `NEXT_RUNTIME`, `NEXT_PHASE`
- **Default**: All have safe defaults or are informational only
- **If unset**: Defaults used; no functional impact beyond cosmetic (`PROXYOS_VERSION` defaults to `'dev'`)
- **Restart-safe?**: Yes.
- **Severity**: OK

#### `AGENT_TOKEN` / `AGENT_ID` / `CENTRAL_URL` (apps/agent)
- **Used in**: `apps/agent/src/ws-client.ts:9-11`
- **Default**: `CENTRAL_URL` defaults to `'ws://localhost:7890'`; others default to `''`
- **If unset**: Agent connects to localhost with empty token — authentication will fail silently (empty token sent as credentials).
- **If invalid**: Non-WS URL for `CENTRAL_URL` will fail at WebSocket connection with a protocol error. Invalid `AGENT_TOKEN` sends as credentials; central rejects with auth error.
- **Restart-safe?**: Yes.
- **Severity**: OK (agent is a separate binary; misconfiguration surfaces immediately on connection)
- **Fix**: None needed — failure is immediate and visible on connection attempt.

### Recommendations

1. **P0 - Add PROXYOS_SECRET rotation guard**: At startup, attempt to decrypt a canary value stored in the DB. If decryption fails, refuse to start and log `[FATAL] PROXYOS_SECRET has changed since initial setup — all encrypted data is unreadable`. Document that the secret is immutable after first DB write. (`packages/api/src/crypto.ts`, `apps/web/src/instrumentation.node.ts`)

2. **P0 - Add PROXYOS_JWT_SECRET startup guard**: Apply the same `process.exit(1)` pattern as `PROXYOS_SECRET`. Remove the `'proxyos-dev-secret-change-in-production'` hardcoded fallback entirely. (`packages/api/src/routers/agents.ts`)

3. **P1 - Require LEMONSQUEEZY_WEBHOOK_SECRET**: Replace `?? ''` with a startup crash or at minimum a loud `console.error` warning when the billing webhook secret is empty. (`apps/web/src/app/api/billing/webhook/route.ts`)

4. **P1 - Centralise PROXYOS_DB_PATH default**: Export a single `DEFAULT_DB_PATH` constant from `packages/db` and import it in `packages/api/src/routers/integrations.ts` to eliminate the divergent `'./proxyos.db'` default. (`packages/db/src/index.ts`, `packages/api/src/routers/integrations.ts`)

5. **P2 - Require METRICS_TOKEN in production**: Gate the metrics endpoint — if `NODE_ENV === 'production'` and `METRICS_TOKEN` is unset, return 503 with a log message rather than serving unauthenticated metrics. (`apps/web/src/app/api/metrics/route.ts`)

6. **P2 - Warn on default PROXYOS_INTERNAL_URL**: Log a startup warning if `PROXYOS_INTERNAL_URL` is at its default and any routes have bot-challenge enabled, prompting the operator to verify Caddy can reach the Next.js app. (`packages/caddy/src/config.ts`)

7. **P3 - Validate numeric env vars**: Add `isNaN` / `<= 0` guards for `PROXYOS_HEARTBEAT_INTERVAL`, `PROXYOS_RECONNECT_DELAY`, `PROXYOS_MAX_RECONNECT_DELAY`, `PROXYOS_WELCOME_TIMEOUT`. (`apps/web/src/instrumentation.node.ts`)

8. **P3 - Log warning when PROXYOS_TLS_SKIP_VERIFY=true**: Add a startup `console.warn('[federation] TLS verification disabled — do not use in production')`. (`apps/web/src/instrumentation.node.ts`)

---

## §1E — Parallel / Half-Shipped Systems

### Summary
- Parallel systems found: 4
- Half-finished systems found: 2
- P0: 1 | P1: 2 | P2: 2 | P3: 1

---

### System: Federation Agent — System 1 (apps/agent) vs System 2 (packages/federation + instrumentation.node.ts)

- **Implementation A**: `apps/agent/src/` — A standalone Node.js process (`ghcr.io/proxyos/agent` image). Connects to the central over WebSocket at `/api/agents/connect?token=<JWT>`. Authenticates using a short-lived JWT signed with `PROXYOS_JWT_SECRET` (HS256, no external library). Managed by the `agents` DB table and `agentsRouter`. The central-side server lives at `apps/web/src/server/federation/ws-server.ts`. Message protocol uses types from `@proxyos/federation` (`FederationMsg`, `AgentToCentralMsg`): `config.full`, `config.diff`, `config.ack`, `config.resync_request`, `metrics.push`, `health.report`, `log.line`. Env vars: `CENTRAL_URL`, `AGENT_TOKEN`, `AGENT_ID`, `CADDY_VERSION`.
- **Implementation B**: `packages/federation/src/` + `apps/web/src/instrumentation.node.ts` (node mode) — The ProxyOS image itself runs as the agent when `PROXYOS_MODE=node`. Uses `FederationClient` from `packages/federation/src/client.ts`. Connects to `/federation/v1` (WebSocket on port 7890). Authenticates via enrollment: posts a one-time token to `/api/federation/enroll`, receives a bcrypt-hashed `auth_key` stored in `nodeAuthKeys`, then passes `Authorization: Bearer <auth_key>` on the WebSocket upgrade. Server-side lives at `packages/federation/src/server.ts`, authenticating against the `federationNodes`/`nodeAuthKeys` tables. Message protocol uses a different type set: `hello`, `welcome`, `config.apply`, `config.reconcile`, `config.ack`, `telemetry.heartbeat`, `config.local_update`, `cmd.ping`, `cmd.revoke`, `cmd.rescan`. Env vars: `PROXYOS_CENTRAL_URL`, `PROXYOS_AGENT_TOKEN`, `PROXYOS_MODE`, `PROXYOS_IDENTITY_PATH`, etc.
- **Canonical**: B (`packages/federation` + `instrumentation.node.ts`) — It is the actively developed design: richer protocol (enrollment, identity persistence, config versioning, local route mirroring, bcrypt auth), multi-tenant/multi-site aware (`tenantId`, `siteId`), and integrated into the primary image without a separate container. System 1 (`apps/agent`) uses a simpler JWT scheme, a separate DB table (`agents`), a different WebSocket path, and has no enrollment or identity persistence.
- **Delete**: A — `apps/agent/` (entire directory), `apps/web/src/server/federation/ws-server.ts`, `apps/web/src/server/federation/agent-registry.ts`, `apps/web/src/server/federation/config-push.ts`, `apps/web/src/server/federation/metrics-collector.ts`, `apps/web/src/server/federation/log-broker.ts`. Also remove `agentsRouter` from `packages/api/src/root.ts` and the `agents`/`agentMetrics`/`revokedAgentTokens` DB tables (via a new migration).
- **Severity**: P0
- **Issue**: Two entirely separate agent protocols exist simultaneously. Both listen/connect on different paths and authenticate with different mechanisms. A node operator following System 1 docs will use `AGENT_TOKEN`/`CENTRAL_URL` and connect to `/api/agents/connect`, which works but is the wrong system. System 2 (the canonical path) uses `PROXYOS_AGENT_TOKEN`/`PROXYOS_CENTRAL_URL` and connects to `/federation/v1`. Having both active means: (a) the `agents` table and `federationNodes` table track overlapping but non-identical agent state, (b) the central server runs two WebSocket servers on different ports/paths, (c) a misconfigured node silently connects to System 1 and appears online in the wrong table, missing all multi-tenant/config-versioning features of System 2.
- **Fix**: Phase 6 — delete `apps/agent/` and the System 1 server infrastructure. Migrate any `agents` table records to `federationNodes`. Remove `agentsRouter` from the API. Update docs to reference only System 2 enrollment flow.

---

### System: Agent Token Authentication — HMAC-SHA256 JWT (agents.ts) vs bcrypt auth_key (federation/server.ts)

- **Implementation A**: `packages/api/src/routers/agents.ts` — Homegrown JWT using `createHash('sha256')` (not HMAC — the "sig" is `sha256(header.payload.secret)`, not a proper HMAC signature). Token is checked client-side by parsing the base64url payload and verifying expiry; the server checks the token hash against `revokedAgentTokens`. Used by System 1 agents only.
- **Implementation B**: `packages/federation/src/server.ts` + `apps/web/src/app/api/federation/enroll/route.ts` — Enrollment generates a `randomBytes(32)` auth key, stores a bcrypt hash in `nodeAuthKeys`, and the node presents the raw key on every WebSocket connection upgrade. The server bcrypt-compares all active keys for the node. Used by System 2 agents.
- **Canonical**: B (bcrypt auth_key) — Standard, auditable, revocable per-key design with proper hash storage. System 1's "JWT" is cryptographically weak (SHA-256 keyed hash is not the same as HMAC-SHA256; the secret is concatenated in the hash input rather than used as the HMAC key).
- **Delete**: The custom JWT signing/verification code in `packages/api/src/routers/agents.ts` (`signAgentToken`, `hashToken`, `base64url`) when System 1 is removed.
- **Severity**: P1
- **Issue**: The System 1 JWT implementation uses `sha256(header + "." + payload + "." + secret)` rather than proper HMAC. This is a non-standard construction that may be vulnerable to length-extension attacks and is not interoperable with standard JWT libraries. It also means the `PROXYOS_JWT_SECRET` env var guards System 1 only; System 2 does not use it.
- **Fix**: Phase 6 — remove with System 1. No remediation needed on System 2 path.

---

### System: API Key Hashing — SHA-256 (legacy) vs HMAC-SHA256 (current)

- **Implementation A**: Legacy SHA-256 hash (`createHash('sha256').update(key).digest('hex')`) — still present in `packages/api/src/apiKeyAuth.ts` as a fallback path. Keys created before the HMAC migration exist in the DB with plain SHA-256 hashes.
- **Implementation B**: HMAC-SHA256 (`createHmac('sha256', PROXYOS_SECRET).update(key).digest('hex')`) — current scheme for all newly created API keys.
- **Canonical**: B (HMAC-SHA256) — keyed hash prevents offline brute-force of stolen DB hashes. The code already auto-migrates legacy rows on first use.
- **Delete**: The `sha256Hash` fallback branch in `resolveApiKey` can be removed once all legacy keys have been rotated or auto-migrated. Do not delete yet — the fallback is actively needed until operators have cycled all pre-migration keys.
- **Severity**: P2
- **Issue**: Until a legacy key is first used after the migration, it remains vulnerable to offline cracking if the `apiKeys` table is exfiltrated (plain SHA-256 is fast to brute-force). The dual-path code adds complexity to the hot authentication path.
- **Fix**: Phase 6 — add a one-time migration script that forcibly re-hashes all remaining SHA-256 keyed rows (requires knowing the original key, which is not stored — so the practical fix is to expire/revoke all pre-migration API keys and delete the fallback branch).

---

### System: Federation WebSocket Server — `packages/federation/src/server.ts` (port 7890) vs `apps/web/src/server/federation/ws-server.ts` (FEDERATION_WS_PORT)

- **Implementation A**: `apps/web/src/server/federation/ws-server.ts` — Creates its own `http.createServer()` and `WebSocketServer`, listens on `FEDERATION_WS_PORT` at path `/api/agents/connect`. Called by System 1 infrastructure. Not integrated into Next.js.
- **Implementation B**: `packages/federation/src/server.ts` — Creates its own `WebSocketServer` listening on port 7890 (configurable via `PROXYOS_FEDERATION_PORT`) at path `/federation/v1`. Started from `instrumentation.node.ts` when mode includes `central` or `standalone`.
- **Canonical**: B (`packages/federation/src/server.ts`) — This is the active federation server with enrollment, multi-tenant support, config versioning, and heartbeat monitoring.
- **Delete**: `apps/web/src/server/federation/ws-server.ts` and its imports (`agent-registry.ts`, `config-push.ts`, `metrics-collector.ts`, `log-broker.ts`) when System 1 is removed in Phase 6.
- **Severity**: P1
- **Issue**: In standalone mode both servers start simultaneously — System 1's server binds `FEDERATION_WS_PORT` and System 2's server binds port 7890. If `FEDERATION_WS_PORT` happens to equal 7890, the second bind will throw `EADDRINUSE` and crash. Even when they bind to different ports, operators must firewall two separate WebSocket ports, and monitoring tools see two "federation" servers with no clear distinction.
- **Fix**: Phase 6 — remove System 1's WebSocket server entirely when `apps/agent/` is deleted.

---

### System: Half-Finished — `validateCaddyRoute` wired nowhere (6 call sites are TODOs)

- **Implementation A**: `// TODO(validate): wire validateCaddyRoute here before pushing` — appears in 6 files: `packages/api/src/routers/caddy.ts:100`, `packages/api/src/routers/drift.ts:70`, `packages/api/src/routers/drift.ts:73`, `packages/api/src/routers/patchos.ts:27`, `packages/api/src/routers/patchos.ts:72`, `packages/api/src/automation/scheduled-changes.ts:57`. A `validateCaddyRoute` function either exists in `packages/caddy/` or was planned but not yet called before any Caddy push.
- **Implementation B**: N/A — validation is absent; routes are pushed to Caddy without pre-flight validation.
- **Canonical**: Validation before push is the correct design. The function needs to be found/created and wired at all 6 sites.
- **Delete**: The TODO comments once the validation is wired.
- **Severity**: P1
- **Issue**: Invalid routes pushed to Caddy can silently break the entire reverse proxy config. Caddy may reject the config atomically (safe) or partially apply it (dangerous). Without pre-push validation, malformed routes from PatchOS, scheduled changes, or drift repair can take down all proxied services.
- **Fix**: Phase 2/3 (not Phase 6) — locate or implement `validateCaddyRoute`, wire it at all 6 sites, and add a test that a malformed route is rejected before reaching Caddy Admin API.

---

### System: Half-Finished — `trusted_proxies` hardcoded, Cloudflare IP refresh unimplemented

- **Implementation A**: `packages/caddy/src/config.ts:475-476` — Two TODOs mark that `trusted_proxies` is hardcoded and Cloudflare IP ranges are not auto-refreshed.
- **Implementation B**: N/A — no dynamic trusted proxy configuration exists.
- **Canonical**: Dynamic trusted proxy config is the intended design.
- **Delete**: Nothing to delete; this is purely additive work.
- **Severity**: P3
- **Issue**: Operators behind Cloudflare get stale IP ranges as Cloudflare adds/removes CIDRs. Real client IPs are misidentified once the hardcoded list drifts. Low urgency but noted as unfinished.
- **Fix**: Phase 6 or later — implement a periodic fetch from `cloudflare.com/ips-v4` and `cloudflare.com/ips-v6`, store in DB or settings, expose a `trustedProxies` env var override.

---

### Recommendations

1. **P0 - Remove System 1 federation entirely (Phase 6)**: Delete `apps/agent/`, `apps/web/src/server/federation/ws-server.ts` and its four sibling files, `agentsRouter` from `packages/api/src/root.ts`, and add a migration to drop/archive the `agents`, `agentMetrics`, `revokedAgentTokens` tables. The System 2 path (`packages/federation/`) is the canonical design and is already active.

2. **P1 - Wire `validateCaddyRoute` at all 6 TODO sites (Phase 2/3)**: Locate or implement the validator, call it before every Caddy Admin API push in `caddy.ts`, `drift.ts`, `patchos.ts`, and `scheduled-changes.ts`. This is a correctness gap, not just cleanup.

3. **P1 - Resolve dual WebSocket server port conflict**: Until System 1 is removed, ensure `FEDERATION_WS_PORT` (System 1) and `PROXYOS_FEDERATION_PORT` (System 2, default 7890) are documented as distinct and never set to the same value. Add a startup check that logs an error if both are equal.

4. **P2 - Force-expire legacy SHA-256 API keys**: Add an admin script or migration that marks all `apiKeys` rows whose `keyHash` length/format indicates SHA-256 (64 hex chars, pre-migration) as expired, forcing operators to regenerate keys. Once complete, remove the `sha256Hash` fallback in `resolveApiKey`.

5. **P3 - Implement Cloudflare IP auto-refresh**: Add a background job that fetches Cloudflare IP ranges on startup and on a 24h schedule, stores them in the DB, and passes them to `buildCaddyRoute` as `trusted_proxies`.

---

### System: Session Cookie Auth Path

- **Implementation A**: `packages/auth/` (better-auth library) — handles login, logout, session creation, cookie signing using `PROXYOS_SECRET`
- **Implementation B**: Three-file workaround (`packages/api/src/routers/users.ts` → `packages/api/src/trpc.ts` → `apps/web/src/app/api/trpc/[trpc]/route.ts`) — injects `Set-Cookie` via response body `__setCookie` field to work around a Next.js 15 standalone build bug
- **Canonical**: A (better-auth) is the primary system; B is a workaround layer on top, not a competing system
- **Delete**: Neither — B patches a Next.js bug and is locked in CLAUDE.md. Remove when upstream bug is confirmed fixed.
- **Severity**: OK
- **Issue**: Not a parallel conflict — both layers are intentional and documented.
- **Fix**: None now. Monitor Next.js/tRPC release notes for fix; remove workaround under conditions specified in CLAUDE.md.

---

### System: Config Sources (DB vs env vars)

- **Implementation A**: Environment variables (`PROXYOS_SECRET`, `CADDY_ADMIN_URL`, etc.) — static, set at container launch
- **Implementation B**: `systemSettings` DB table — runtime-mutable config (force_https, maintenance_mode, trusted_proxies) changeable without container restart
- **Canonical**: Both coexist by design — env vars for infrastructure config, DB for user-mutable runtime settings
- **Delete**: Neither
- **Severity**: P2
- **Issue**: The boundary between env-var config and DB config is undocumented. Users can't tell which settings require a container restart vs which are live-editable. The `PROXYOS_DB_PATH` default inconsistency (§1D) is a symptom of this unclear boundary.
- **Fix**: Document which settings are env-var-only (restart required) vs DB-mutable (live-editable). Expose active non-secret env var values in `/api/health/detailed` for operator visibility.

---

## §1F — Test Coverage Gaps

### Summary
- Test files found: 4 (all in `packages/caddy/src/__tests__/`)
- Critical source files with 0% coverage: 47 (all routers, all API utilities, all automation, DB layer, auth layer, apps/agent)
- P0: 3 | P1: 6 | P2: 9 | P3: many

### Existing Tests

All 4 test files are in `packages/caddy/src/__tests__/` and use Vitest. Coverage is unit-level, pure functions only, no I/O.

| File | What it covers |
|------|---------------|
| `config.test.ts` | `buildCaddyRoute` — HTTP/HTTPS upstream detection, headers, health checks, blue-green split, SSO forward_auth, basic auth, rate limit, WAF, HSTS, compression, geoip, matcher, LB policy, `@id` determinism. `buildTrustedProxies` ranges. |
| `transport.test.ts` | Transport block emission for scheme-based HTTPS, HTTPS ports, skipTlsVerify, scheme stripping, container-name upstreams. Overlaps significantly with `config.test.ts`. |
| `validate.test.ts` | `validateCaddyRoute` — missing Host, missing X-Real-IP, missing @id, empty upstreams, malformed dial, HTTPS port without transport. `formatValidation` output format. |
| `verify.test.ts` | `diffCaddyRoute` — identical routes, missing headers, Caddy-injected defaults ignored, upstream changes, missing transport, @id diff, handler array length mismatch. `classifyDrift` — all sync_source values including fail-closed null/unknown. |

No test runner is configured at the repo root. No `vitest.config.ts` or `jest.config.ts` exists at root level. Tests are runnable only from `packages/caddy/` directly.

### Coverage Gaps

#### [packages/caddy/src/client.ts] Caddy Admin API client
- **Risk**: P1 — `CaddyClient` is the sole bridge between ProxyOS and the running Caddy process. Regressions in `replaceRoutes`, `upsertRoute`, `deleteRoute`, or `verifyRoute` would cause silent config divergence or failed pushes with no test to catch them. The HTTP request construction (URL building, JSON serialization, error handling) is entirely untested.
- **What a test would verify**: Mock `fetch`; assert correct HTTP method, URL, and body for each Admin API call; assert error propagation when Caddy returns 4xx/5xx; assert `verifyRoute` returns null when route is absent (404).
- **Test type**: Unit test (mock fetch)

#### [packages/caddy/src/bootstrap.ts] Startup route replacement
- **Risk**: P1 — `replaceRoutes` at startup is the mechanism that makes all routes survive a container restart. A regression here means routes are lost silently on every deploy. No test exists. Commit `ea15c6a` (broken Caddy placeholder) would have been caught at this layer if an integration test existed.
- **What a test would verify**: Given a set of DB routes, assert the correct sequence of Admin API calls is made; assert `sync_source` is set to `'bootstrap'` after push; assert partial failure does not leave routes in a half-replaced state.
- **Test type**: Integration test (requires Caddy Admin API mock or real container)

#### [packages/api/src/routers/routes.ts] Route CRUD + Caddy push
- **Risk**: P1 — `createRoute`, `updateRoute`, `deleteRoute`, `exposeRoute`, `forceResync` are the highest-traffic mutations in the system. Each calls into `buildCaddyRoute` + `CaddyClient` and must set `sync_source` correctly. A regression in any of these means user-visible routes stop working or drift detection misfires. No test exists.
- **What a test would verify**: Mock DB + mock CaddyClient; assert that after `createRoute` the correct Caddy upsert is called and `sync_source` is `'manual'`; assert `forceResync` sets `sync_source` to `'drift-repair'`; assert disabled routes are deleted from Caddy.
- **Test type**: Unit test (mock DB and CaddyClient)

#### [packages/api/src/routers/users.ts] Login / logout (auth cookie workaround) — LOCKED FILE
- **Risk**: P0 — The `__setCookie` workaround (commit `1c9bf69`) is a three-file mechanism that is already locked. A regression in the `login` or `logout` procedure that silently drops the cookie would leave users unable to authenticate, with no test to detect it. The defensive guard (`typeof ctx.resHeaders.append === 'function'`) is not tested under standalone build conditions.
- **What a test would verify**: Call the login procedure; assert response body contains `__setCookie`; assert the tRPC route handler (`apps/web/src/app/api/trpc/[trpc]/route.ts`) correctly promotes `__setCookie` to a real `Set-Cookie` response header and strips it from the body.
- **Test type**: Integration test — A viable approach: use `fetchRequestHandler` directly in Vitest with a synthetic `Request` object (no Next.js server required). Call `fetchRequestHandler({ router, req, endpoint: '/api/trpc' })` and assert the returned `Response` has a `Set-Cookie` header and the body JSON does not contain `__setCookie`.

#### [packages/api/src/auth.ts] Session/API key authentication middleware
- **Risk**: P0 — `auth.ts` is the gate that enforces authentication on all protected procedures. Any regression (wrong session validation, API key bypass, missing user context) constitutes an auth bypass. No test exists.
- **What a test would verify**: Valid session token passes; expired token is rejected; API key with correct permissions passes `protectedProcedure`; API key with wrong scope is rejected; missing token returns UNAUTHORIZED; RBAC role check rejects insufficient-role callers.
- **Test type**: Unit test (mock session store)

#### [packages/api/src/routers/caddy.ts] Caddy admin procedures
- **Risk**: P1 — Exposes `reloadConfig`, `getStatus`, `getLogs` to the UI. A regression in `reloadConfig` could push a malformed config to Caddy and break all routes. No test exists.
- **What a test would verify**: Mock CaddyClient; assert `reloadConfig` calls the correct Admin API endpoint; assert error from Caddy is surfaced rather than swallowed.
- **Test type**: Unit test (mock CaddyClient)

#### [packages/api/src/automation/drift-detector.ts] Periodic drift detection
- **Risk**: P1 — Runs on a timer and calls `verifyAndPersist` for every route. A regression (wrong interval, skipped routes, wrong `sync_source` classification) means drift goes undetected silently. No test exists.
- **What a test would verify**: Given a set of routes with known Caddy state, assert `verifyAndPersist` is called for each; assert `sync_status` is updated correctly; assert the scheduler does not fire during Caddy startup (race condition noted in §1E).
- **Test type**: Unit test (mock timers + mock CaddyClient)

#### [packages/db/src/migrations.ts] Migration runner
- **Risk**: P2 — Applies DDL migrations sequentially. A regression in the runner (wrong order, re-applying already-applied migrations, skipping migrations) would corrupt the DB schema silently at startup. No test exists for the runner logic itself (only the SQL content is locked).
- **What a test would verify**: Given an in-memory SQLite DB, assert migrations are applied in order; assert idempotency (running twice does not error); assert a failed migration rolls back cleanly.
- **Test type**: Unit test (in-memory SQLite via better-sqlite3)

#### [packages/api/src/rateLimiter.ts] Rate limiting middleware
- **Risk**: P2 — Protects login and API endpoints. A regression that disables rate limiting exposes the instance to brute-force attacks without any visible error. No test exists.
- **What a test would verify**: N requests within window are allowed; N+1 request is rejected with 429; window resets after TTL.
- **Test type**: Unit test (mock clock)

#### [packages/api/src/totp.ts] TOTP verification
- **Risk**: P0 — TOTP is a second authentication factor. A regression that accepts any code, always rejects, or has a timing vulnerability constitutes an auth bypass or denial of service. No test exists.
- **What a test would verify**: Valid TOTP code for current window passes; code from prior window (outside tolerance) fails; invalid code fails; replay of used code fails if replay protection is implemented.
- **Test type**: Unit test (known TOTP secret + fixed clock)

#### [packages/api/src/automation/docker-discovery.ts] Container discovery
- **Risk**: P2 — Queries the Docker socket and populates container/upstream data used by the Expose flow. A regression could expose wrong containers, miss containers, or crash if Docker is unreachable. No test exists.
- **What a test would verify**: Mock Docker API responses; assert discovered containers map correctly to upstream candidates; assert graceful handling when Docker socket is unavailable.
- **Test type**: Unit test (mock Docker client)

#### [packages/api/src/automation/scheduled-changes.ts] Scheduled route mutations
- **Risk**: P2 — Executes timed route changes. A regression could apply changes at the wrong time, apply them twice, or fail to set `sync_source` to `'scheduled'` (breaking drift classification). No test exists.
- **What a test would verify**: Mock clock triggers the scheduled change at the correct time; `sync_source` is `'scheduled'` after push; already-applied changes are not re-applied.
- **Test type**: Unit test (mock timers + mock DB)

#### [apps/agent/src/caddy-sync.ts] Agent-side Caddy sync
- **Risk**: P2 — Used in multi-node setups to push config from central to edge Caddy. Untested. Regressions would cause edge nodes to run stale config silently.
- **What a test would verify**: Config diff detection; push triggers on change; no push when config is identical.
- **Test type**: Unit test (mock HTTP client)

### Notable: What IS covered (and why it matters)

The 4 existing caddy tests cover the most mechanically complex pure-function layer: config generation (`buildCaddyRoute`) and drift detection (`diffCaddyRoute`/`classifyDrift`). This is meaningful — commit `ea15c6a` (broken Caddy placeholder syntax) is exactly the class of bug these tests catch. The transport logic is tested twice (both `config.test.ts` and `transport.test.ts` overlap on HTTPS detection), which is a duplication but not harmful.

The critical gap is that the tests stop at the caddy package boundary. Everything that calls into the caddy package — all routers, all automation, the CaddyClient itself — has 0% coverage. A regression in `CaddyClient.upsertRoute` would not be caught by any existing test.

### No test runner at root

There is no `vitest.config.ts`, `jest.config.ts`, or root-level `test` script in `package.json`. Running `pnpm test` at repo root would currently do nothing (or error). Tests must be run from `packages/caddy/` directly. This means CI cannot enforce test passage unless a root test script is added.

### Out of Scope / Not Audited in §1F

The following packages were excluded from the §1F test-coverage inventory and are deferred to Phase 5 planning:

- **`packages/federation/`** — System 2 federation (bcrypt auth, canonical inter-node protocol). No tests exist. Risk is P2: a regression in federation token validation would cause inter-node calls to silently fail. Deferred because federation is not yet enabled in production deployments.
- **`packages/alerts/`** — Alert rule evaluator and notification dispatcher (`evaluator.ts`, `notify.ts`). No tests exist. Risk is P3: alert misfires are annoying but do not break routing or auth. Deferred because the evaluator loop is a background concern.

Both packages should be added to the Phase 5 test-coverage sprint. Their absence from §1F does not change the P0/P1 priority rankings above.
