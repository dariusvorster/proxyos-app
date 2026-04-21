# Upgrades

> How to update ProxyOS to a new version without data loss.

## What it does

ProxyOS database migrations are additive-only. New versions add columns and tables; they never drop existing data. Downgrades to older versions after a migration may leave unknown columns but will not corrupt data in most cases.

## How to upgrade

### Standard upgrade

```bash
# Pull the new image
docker compose pull

# Recreate the container (migrations run automatically on startup)
docker compose up -d

# Verify it started cleanly
docker compose logs --tail=50 proxyos
docker compose ps
```

### With a pre-upgrade backup (recommended)

```bash
# Back up the database before upgrading
docker compose exec proxyos sqlite3 /data/proxyos/proxyos.db \
  ".backup /data/proxyos/pre-upgrade-$(date +%Y%m%d).db"

# Pull and recreate
docker compose pull
docker compose up -d

# Verify
docker compose logs --tail=50 proxyos
```

If the upgrade fails, restore the backup:

```bash
docker compose stop proxyos
docker run --rm -v proxyos_proxyos-data:/data alpine \
  cp /data/proxyos/pre-upgrade-YYYYMMDD.db /data/proxyos/proxyos.db
docker compose up -d --force-recreate
```

## What changes between versions

Database migrations are the primary change that affects existing data. Each migration is a set of SQL statements that add new tables or columns. Existing rows are not modified.

Caddy binary version and plugins may also change between ProxyOS releases. The new Caddy binary starts automatically on container restart. If Caddy's behavior changes in a way that affects your routes, check the ProxyOS changelog.

## Troubleshooting

- **Container crashes after upgrade**: Check logs for migration errors. Restore the pre-upgrade database if needed.
- **New features not appearing**: Clear your browser cache after upgrading — Next.js static assets are versioned but cached aggressively.
- **Routes stopped working after upgrade**: Check the Sync column. A Caddy version bump may require a re-push if the route format changed.
