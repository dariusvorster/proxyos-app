# Backup and Restore

> How to back up and restore the ProxyOS database and Caddy certificate state.

## What it does

ProxyOS state lives in three Docker volumes:

| Volume | Contents | Backup priority |
|---|---|---|
| `proxyos-data` | SQLite database, access log | Critical — contains all route config |
| `caddy-data` | TLS certificates, ACME accounts | Important — losing this triggers re-issuance |
| `caddy-config` | Caddy runtime config | Low — regenerated from the database on startup |

## How to back up

### Database only (minimum viable backup)

```bash
# While container is running (sqlite3 .backup is safe for live databases)
docker compose exec proxyos sqlite3 /data/proxyos/proxyos.db \
  ".backup /data/proxyos/proxyos.db.backup"

# Copy the backup to the host
docker compose cp proxyos:/data/proxyos/proxyos.db.backup ./proxyos-$(date +%Y%m%d).db
```

### Full volume backup

```bash
# Stop the container for a consistent snapshot (optional but safest)
docker compose stop proxyos

# Backup proxyos-data volume
docker run --rm \
  -v proxyos_proxyos-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/proxyos-data-$(date +%Y%m%d).tar.gz -C /data .

# Backup caddy-data volume
docker run --rm \
  -v proxyos_caddy-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/caddy-data-$(date +%Y%m%d).tar.gz -C /data .

# Restart
docker compose start proxyos
```

### Automated backup

Add a cron job on the host to run the backup script daily:

```bash
# /etc/cron.daily/proxyos-backup
#!/bin/bash
set -e
BACKUP_DIR=/opt/backups/proxyos
mkdir -p "$BACKUP_DIR"
docker exec proxyos sqlite3 /data/proxyos/proxyos.db \
  ".backup /data/proxyos/proxyos.db.backup"
docker cp proxyos:/data/proxyos/proxyos.db.backup \
  "$BACKUP_DIR/proxyos-$(date +%Y%m%d).db"
# Keep last 30 days
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete
```

## How to restore

### Restore database

```bash
# Stop the container
docker compose stop proxyos

# Copy the backup into the volume
docker run --rm \
  -v proxyos_proxyos-data:/data \
  -v $(pwd):/backup \
  alpine cp /backup/proxyos-20250101.db /data/proxyos/proxyos.db

# Start the container
docker compose start proxyos
```

### Restore full volumes

```bash
docker compose stop proxyos

# Restore proxyos-data
docker run --rm \
  -v proxyos_proxyos-data:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "cd /data && tar xzf /backup/proxyos-data-20250101.tar.gz"

# Restore caddy-data
docker run --rm \
  -v proxyos_caddy-data:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "cd /data && tar xzf /backup/caddy-data-20250101.tar.gz"

docker compose start proxyos
```

## Troubleshooting

- **Database corrupted after restore**: Verify the backup file first: `sqlite3 backup.db "PRAGMA integrity_check;"`
- **Caddy re-issuing all certificates after restore**: This is normal if `caddy-data` was not backed up. Let's Encrypt rate limits apply — if you hit a rate limit, use `internal` TLS temporarily.
