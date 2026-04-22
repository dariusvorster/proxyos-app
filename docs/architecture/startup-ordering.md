# ProxyOS Startup Ordering

## 1. Single-Container Architecture

ProxyOS ships as a **single Docker container**. There is no multi-service `docker-compose.yml` that requires `depends_on` ordering between containers. The `docker-compose.yml` defines one service (`proxyos`) that mounts `/var/run/docker.sock` for network discovery — no inter-service dependency ordering is needed or applicable.

All internal process ordering is managed by **s6-overlay**, which runs inside the container.

## 2. s6-overlay Service Graph

The container defines four s6-rc services under `docker/s6-overlay/s6-rc.d/`:

| Service | Type | Depends on | Role |
|---|---|---|---|
| `caddy` | longrun | (none) | Runs `caddy run --config /etc/caddy/base-config.json` |
| `caddy-ready` | oneshot | `caddy` | Polls `http://localhost:2019/config/` until Caddy Admin API responds (60s timeout), exits 1 on failure |
| `proxyos` | longrun | `caddy` | Polls Caddy Admin API (60s), then runs `node server.js` |
| `logrotate` | longrun | (none) | Log rotation, independent |

The `user` bundle brings up `caddy`, `proxyos`, and `logrotate` together. The declared s6 dependency edges enforce:

- `caddy-ready` will not start until `caddy` is up
- `proxyos` will not start until `caddy` is up

Additionally, the `proxyos/run` script contains its own inline poll loop — it will not exec `node server.js` until `http://localhost:2019/config/` responds successfully or the 60-second timeout expires.

## 3. Intra-Process Bootstrap Sequence

Once `node server.js` starts, Next.js executes `apps/web/src/instrumentation.node.ts` before serving any requests. That file calls `bootstrapProxyOs(baseConfigPath)`, which:

1. Runs DB migrations to completion before doing anything with Caddy
2. Calls `waitForCaddyReady()` from `packages/caddy/src/wait-ready.ts` — polls `http://localhost:2019/config/` every 250ms for up to 30 seconds
3. Loads the base Caddy config
4. Pushes all stored routes to Caddy via `replaceRoutes`

If `bootstrapProxyOs` reports `caddyReachable: false`, the API continues running but logs a warning — it does not crash, allowing the container to recover if Caddy starts late.

## 4. Full Startup Sequence

```
Container start
  └─ s6-overlay init
       ├─ caddy (longrun)         ← starts first, no dependencies
       ├─ caddy-ready (oneshot)   ← waits for caddy admin API (localhost:2019)
       ├─ proxyos (longrun)       ← polls caddy admin API, then: node server.js
       │    └─ instrumentation.node.ts
       │         ├─ PROXYOS_SECRET validation
       │         ├─ bootstrapProxyOs()
       │         │    ├─ DB migrations complete
       │         │    ├─ waitForCaddyReady() [packages/caddy/src/wait-ready.ts]
       │         │    └─ replaceRoutes() → pushes all routes to Caddy
       │         ├─ startCollector() — analytics log tailer
       │         ├─ startEvaluator() — alert evaluator (60s interval)
       │         └─ federation server/client (if PROXYOS_MODE configured)
       └─ logrotate (longrun)     ← independent
```

## 5. depends_on Audit Conclusion

The spec concern — "Caddy must be ready before API starts; DB migrations must complete before API starts" — is satisfied entirely within the single container:

- **Caddy before API**: enforced at two layers — s6 dependency graph (`proxyos` depends on `caddy`) plus the inline poll in `proxyos/run` and the `waitForCaddyReady()` call inside `bootstrapProxyOs`.
- **Migrations before routes**: enforced inside `bootstrapProxyOs()` — migrations run to completion before `replaceRoutes` is called.
- **docker-compose `depends_on`**: not applicable. There is only one service in `docker-compose.yml`. No change needed.

The startup ordering is correct as implemented.
