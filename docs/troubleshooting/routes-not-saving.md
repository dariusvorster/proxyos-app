# Problem: Routes Not Saving

## Symptoms

- You edit a route and click Save, but the changes revert on page reload
- The save button appears to do nothing
- An error toast appears briefly but disappears before you can read it
- The route saves in the UI but the change is not reflected in Caddy (Sync column shows `drift`)

## Why this happens

Route saves go through a tRPC mutation that writes to SQLite and then pushes the update to Caddy. Failures can happen at any of these stages:

1. **Validation error** — the submitted data fails server-side validation (e.g., duplicate domain, invalid upstream address format)
2. **SQLite write error** — unlikely in normal operation, but can occur if the database file is corrupted or the volume is full
3. **Caddy push failure** — the write to SQLite succeeded but the Caddy Admin API call failed; the route is saved in the DB but Caddy has old config
4. **Browser-side optimistic update** — the UI shows the new value before the server confirms; if the server returns an error, the UI reverts

## Diagnosis

**Check the browser console:**

Open DevTools → Console. Failed tRPC mutations will show as network errors. Click on the failed request and look at the response body — it will contain the error message.

**Check the Network tab:**

Filter for `trpc`. Find the `routes.update` or `routes.create` call. Check the response status and body.

**Check container logs:**

```bash
docker compose logs proxyos --tail=50
```

Look for error-level log lines around the time you attempted to save.

**Check the Sync column:**

If the route appears to save (no error shown) but the Sync column shows `drift`, the database was updated but the Caddy push failed. Click **Re-push** on the route detail page.

## Fix

### Fix 1: Read the validation error

Most save failures are validation errors with a clear message. Check the browser console or the error toast. Common validation errors:

- `Domain already in use` — another route (or redirect/error host) already has this domain
- `Invalid upstream address` — the upstream field has a malformed URL
- `Domain is required` — a required field is empty

Fix the data and try again.

### Fix 2: Re-push after a Caddy failure

If the route is in the database but Caddy has stale config:

1. Go to the route detail page
2. Click **Re-push** (shown when `sync_status` is `drift`)
3. Verify the Sync column changes to `synced`

### Fix 3: Check disk space

```bash
docker system df
df -h /var/lib/docker
```

If the volume is full, free space and retry.

### Fix 4: Check database integrity

```bash
docker compose exec proxyos sqlite3 /data/proxyos/proxyos.db "PRAGMA integrity_check;"
```

Output should be `ok`. If not, restore from backup (see [Backup and Restore](../admin/backup-and-restore.md)).

## Prevention

- Keep at least 1 GB free on the volume backing `proxyos-data`
- Watch the Sync column after saves — a persistent `drift` status means Caddy and the DB are out of sync
- Run regular database backups

## Related

- [Container Won't Start](container-wont-start.md)
- [Database](../admin/database.md)
- [Backup and Restore](../admin/backup-and-restore.md)
