# Problem: Secret Rotation Logs Everyone Out

## Symptoms

- After changing `PROXYOS_SECRET` in `.env` and restarting the container, all users are logged out
- The login page is shown for all users even though they were previously logged in
- Session cookies are present in the browser but the server rejects them with 401

## Why this happens

This is **expected behavior**, not a bug.

`PROXYOS_SECRET` is used by `better-auth` to sign session tokens. When you change the secret, all previously issued session tokens are signed with the old secret and can no longer be verified. The server rejects them as invalid, effectively logging out everyone.

There is no partial migration — all active sessions become invalid the moment the container restarts with a new secret.

## When this happens unintentionally

The most common unintentional cause is accidentally changing `PROXYOS_SECRET`:

- **Copy-paste error** when editing `.env`
- **Regenerating `.env`** from a template without preserving the existing secret
- **A deployment tool** that overwrites `.env` with a freshly generated value
- **Volume being lost** — if the secret was stored in a volume that was deleted, a new secret is generated

## Diagnosis

Confirm the secret changed:

```bash
# If you have a backup of the old .env
diff .env.backup .env | grep PROXYOS_SECRET
```

Check container logs for any authentication errors that started at the restart time:

```bash
docker compose logs proxyos --since="restart-time" | grep -i "auth\|session\|invalid"
```

## Fix

### If the logout was intentional (you changed the secret deliberately)

All users simply need to log in again. The new sessions will be signed with the new secret and work correctly.

### If the logout was accidental (you want to restore the old secret)

1. Retrieve the old secret from:
   - Your secrets manager (Vault, LockBoxOS, etc.)
   - A backup of `.env`
   - Git history (if `.env` was accidentally committed — you should also rotate the secret if this happened)

2. Restore the old value in `.env`:
   ```env
   PROXYOS_SECRET=old-value-here
   ```

3. Restart the container:
   ```bash
   docker compose up -d --force-recreate
   ```

Existing session cookies will work again.

## Prevention

- Store `PROXYOS_SECRET` in a secrets manager, not just in `.env`
- Never commit `.env` to version control
- When updating `.env` for other reasons, explicitly preserve the `PROXYOS_SECRET` value
- Keep a secure backup of `PROXYOS_SECRET` separate from the compose file
- Document in your runbook that changing this value is a breaking change for active sessions

## Related

- [Not Authenticated](not-authenticated.md)
- [Cookie Not Persisting](cookie-not-persisting.md)
- [Docker Compose Reference](../getting-started/docker-compose-reference.md)
- [Secrets Management](../admin/secrets-management.md)
