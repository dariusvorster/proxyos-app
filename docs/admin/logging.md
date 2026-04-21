# Logging

> ProxyOS produces two distinct log streams: application logs (stdout) and Caddy access logs (file).

## What it does

**Application logs** are written to stdout by the Node.js process and captured by Docker. They include startup messages, tRPC errors, database operations at debug level, and auth events.

**Caddy access logs** are written to `/data/proxyos/access.log` in JSON format. Each line is one HTTP request that Caddy handled. These logs are parsed by ProxyOS's instrumentation service to populate the analytics tables.

**System log**: ProxyOS also writes structured events to the `system_log` table in the database (level: `info`/`warn`/`error`, category: `auth`/`caddy`/`system`/`api`/`user`). These are visible in **Settings → System Log** in the dashboard.

## How to configure

### Log level

Set the `LOG_LEVEL` environment variable:

```env
LOG_LEVEL=info   # error | warn | info | debug
```

### Access log location

The access log path is fixed at `/data/proxyos/access.log` (set by `PROXYOS_ACCESS_LOG` in the Dockerfile). It lives on the `proxyos-data` volume.

### Log rotation

ProxyOS includes a logrotate configuration in the container at `/etc/logrotate.d/proxyos`. The access log is rotated automatically. s6-overlay runs logrotate on a schedule via the container's cron service.

## How to read logs

**Application logs (Docker):**

```bash
# Live tail
docker compose logs -f proxyos

# Last 100 lines
docker compose logs --tail=100 proxyos

# Filter for errors
docker compose logs proxyos 2>&1 | grep -i error
```

**Access log (raw JSON):**

```bash
docker compose exec proxyos tail -f /data/proxyos/access.log
```

**Access log (pretty-printed):**

```bash
docker compose exec proxyos tail -f /data/proxyos/access.log | jq .
```

## Troubleshooting

- **Access log not being written**: Caddy may not be running or the volume may not be mounted. Check `docker compose logs proxyos | grep caddy`.
- **Log file growing too large**: Check logrotate is running inside the container. Manually rotate: `docker compose exec proxyos logrotate /etc/logrotate.d/proxyos`
- **Debug logging too verbose**: Set `LOG_LEVEL=info` or `LOG_LEVEL=warn` in `.env`
