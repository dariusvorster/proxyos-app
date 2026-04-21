# Problem: Container Won't Start

## Symptoms

- `docker compose up -d` starts the container but it immediately exits
- `docker compose ps` shows `Exiting` or `unhealthy` status
- The container starts but the health check never passes
- ProxyOS logs show startup errors

## Why this happens

The most common causes:

1. **`PROXYOS_SECRET` is not set** — The startup code calls `process.exit(1)` if `PROXYOS_SECRET` is missing in production
2. **Port conflict** — Port 80, 443, or the dashboard port is already in use
3. **Database corruption** — SQLite file is corrupted and migrations fail on startup
4. **Volume permission issue** — The process cannot write to `/data/proxyos`
5. **Caddy fails to start** — Invalid base config or Caddy binary issue
6. **Out of memory** — The container is OOM-killed

## Diagnosis

**Read the logs first:**

```bash
docker compose logs proxyos
# or for more history:
docker compose logs --tail=200 proxyos
```

**Check the exit code:**

```bash
docker inspect proxyos --format '{{.State.ExitCode}}'
```

Exit code 1 usually means an application error. Exit code 137 means OOM kill.

**Check for port conflicts:**

```bash
ss -tlnp | grep ':80\|:443\|:3091'
# or
lsof -i :80
```

**Check Caddy specifically:**

s6-overlay runs Caddy and Node.js as separate supervised services. If Caddy fails, check:

```bash
docker compose logs proxyos | grep -i caddy
```

## Fix

### Fix 1: Set PROXYOS_SECRET

Ensure `.env` contains:

```env
PROXYOS_SECRET=your-secret-here
```

The startup guard in ProxyOS calls `process.exit(1)` during boot if this variable is missing in `NODE_ENV=production`. Recreate the container after fixing `.env`:

```bash
docker compose up -d --force-recreate
```

### Fix 2: Resolve port conflicts

Find what is using the conflicting port:

```bash
ss -tlnp | grep :80
```

Either stop the conflicting process or change the ProxyOS port mapping in `.env`:

```env
PROXYOS_HTTP_PORT=8080
PROXYOS_HTTPS_PORT=8443
```

### Fix 3: Recover the database

If migration fails on startup:

```bash
# Inspect the database
docker compose run --rm proxyos sqlite3 /data/proxyos/proxyos.db ".tables"
```

If the database is corrupted, restore from backup. See [Backup and Restore](../admin/backup-and-restore.md).

### Fix 4: Fix volume permissions

```bash
docker compose run --rm --entrypoint sh proxyos -c "ls -la /data/proxyos"
```

The process runs as the Node.js user. If the volume was created by a different user, you may need to `chown` it:

```bash
docker compose run --rm --entrypoint sh proxyos -c "chown -R node:node /data/proxyos"
```

### Fix 5: Check available memory

```bash
free -h
docker stats proxyos --no-stream
```

If the container is being OOM-killed, increase available memory or add a `mem_limit` to the compose file that is high enough.

## Prevention

- Always test `.env` completeness before deploying: `docker compose config` will warn about missing required variables
- Run regular database backups so you can recover from corruption
- Monitor disk space — a full disk causes write failures that can corrupt SQLite

## Related

- [Docker Compose Reference](../getting-started/docker-compose-reference.md)
- [Database](../admin/database.md)
- [Backup and Restore](../admin/backup-and-restore.md)
