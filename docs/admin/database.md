# Database

> ProxyOS uses SQLite (via better-sqlite3) stored at `/data/proxyos/proxyos.db` on the `proxyos-data` volume.

## What it does

The database is the source of truth for all ProxyOS configuration. When ProxyOS starts, it runs any pending database migrations automatically (additive-only — existing data is never modified by migrations).

The schema is managed by Drizzle ORM. Tables are defined in `packages/db/src/schema.ts`.

## Key tables

| Table | Contents |
|---|---|
| `routes` | Proxy route configuration |
| `redirect_hosts` | Redirect host configuration |
| `error_hosts` | Error host configuration |
| `streams` | TCP/UDP stream configuration |
| `users` | Dashboard user accounts |
| `audit_log` | All mutating actions |
| `access_log` | Per-request access records (recent) |
| `traffic_metrics` | Aggregated request metrics by time bucket |
| `health_checks` | Health check results history |
| `certificates` | Certificate status and metadata |
| `sso_providers` | SSO forward-auth providers |
| `dns_providers` | DNS challenge providers |
| `api_keys` | API key credentials |
| `agents` | Federation agent registrations |

## How to access the database

**Interactive SQLite shell (read-only queries):**

```bash
docker compose exec proxyos sqlite3 /data/proxyos/proxyos.db
```

**Quick query:**

```bash
docker compose exec proxyos sqlite3 /data/proxyos/proxyos.db \
  "SELECT domain, sync_status, enabled FROM routes ORDER BY created_at;"
```

**Check integrity:**

```bash
docker compose exec proxyos sqlite3 /data/proxyos/proxyos.db "PRAGMA integrity_check;"
```

Output should be `ok`. Any other output indicates corruption.

## Migrations

Migrations are applied automatically on startup. They are append-only: existing migration entries in `packages/db/src/migrations.ts` are never modified. New schema changes always add a new migration entry.

If a migration fails on startup, the container will not start cleanly. Check logs:

```bash
docker compose logs proxyos | grep -i migration
```

## Troubleshooting

- **Database corruption**: Restore from backup (see [Backup and Restore](backup-and-restore.md))
- **Disk full**: Check available space on the volume. SQLite will fail all writes when disk is full.
- **Migration failure**: Check the logs for the specific SQL error. Do not modify existing migration entries — create a corrective migration instead.
