# Security Hardening

> Recommended practices for running ProxyOS securely in production.

## What it does

This page documents security-relevant configuration choices and recommendations for hardening a ProxyOS deployment.

## Hardening checklist

### Container and host

- [ ] Do not publish port `2019` (Caddy Admin API) — it is intentionally not in the compose file's port list
- [ ] Mount the Docker socket read-only: `/var/run/docker.sock:/var/run/docker.sock:ro`
- [ ] Use a named volume for `proxyos-data` — do not bind-mount to a world-readable directory
- [ ] Set resource limits in `docker-compose.yml` (`mem_limit`, `cpus`) to prevent DoS via resource exhaustion
- [ ] Keep Docker Engine updated on the host

### Secrets

- [ ] Generate `PROXYOS_SECRET` with `openssl rand -hex 32` — minimum 32 bytes of entropy
- [ ] Never commit `.env` to version control
- [ ] Store `PROXYOS_SECRET` in a secrets manager (LockBoxOS, Vault, or a password manager)
- [ ] Rotate `PROXYOS_SECRET` annually or after any suspected compromise — note this logs all users out

### Network

- [ ] Run the dashboard behind HTTPS (create a ProxyOS route for the dashboard domain itself)
- [ ] Restrict access to the dashboard port (`3091`) to trusted networks using firewall rules
- [ ] If not using Cloudflare Tunnel, consider putting the dashboard behind SSO
- [ ] The Caddy Admin API (`localhost:2019`) must never be accessible from outside the container

### Routes

- [ ] Enable WAF (`blocking` mode) on public-facing routes that accept user input
- [ ] Enable rate limiting on authentication endpoints
- [ ] Enable HSTS on all public HTTPS routes
- [ ] Use IP allowlists for admin services that should only be accessed from specific networks
- [ ] Review the access log regularly for suspicious patterns

### Accounts

- [ ] Create one account per human user — do not share credentials
- [ ] Enable TOTP (two-factor authentication) for all accounts (available in account settings)
- [ ] Use the `viewer` role for accounts that only need read access
- [ ] Revoke accounts promptly when a user leaves

### API keys

- [ ] Create API keys with the minimum required scopes
- [ ] Set expiry dates on API keys
- [ ] Rotate API keys regularly

## Caddy Admin API security note

The Caddy Admin API (`localhost:2019`) has full control over Caddy's configuration. ProxyOS uses it internally to push route configuration. It must never be exposed to external networks. The reference `docker-compose.yml` does not publish port `2019` — do not add it.

## Troubleshooting

- **Hardened setup losing access**: If you restrict the dashboard port with a firewall and lock yourself out, access the container directly: `docker compose exec proxyos sqlite3 /data/proxyos/proxyos.db "SELECT email FROM users;"`
