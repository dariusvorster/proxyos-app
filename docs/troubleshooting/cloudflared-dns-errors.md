# Problem: Cloudflared DNS Errors After Rebuild

## Symptoms

- After rebuilding or recreating the ProxyOS container, Caddy fails to resolve upstream hostnames
- Logs show errors like `dial tcp: lookup upstream-host: server misbehaving`
- Routes that worked before the rebuild now return 502 or fail health checks
- The issue affects hostname-based upstreams but not IP-based ones
- Restarting the container again sometimes (but not always) fixes it temporarily

## Why this happens

When Docker recreates a container, the new container inherits `/etc/resolv.conf` from the Docker daemon. In some environments (especially when `cloudflared` or another DNS-over-HTTPS proxy is running on the host), the inherited nameserver entry points to a local resolver (`127.0.0.x`) that is not reachable from inside the container's network namespace, or is a stale entry from the previous container's network state.

Caddy performs DNS resolution for upstream hostnames on first use. If the resolver is broken, Caddy logs `server misbehaving` and the dial fails.

This is a Docker + host DNS configuration interaction, not a ProxyOS bug.

## Diagnosis

**Check DNS resolution from inside the container:**

```bash
docker compose exec proxyos nslookup upstream-hostname
# or
docker compose exec proxyos wget -qO- http://upstream-hostname:port
```

If `nslookup` fails with `server misbehaving` or times out, DNS is broken inside the container.

**Check what resolvers the container is using:**

```bash
docker compose exec proxyos cat /etc/resolv.conf
```

If it shows `nameserver 127.0.0.1` or `nameserver 127.0.0.53`, the container is trying to use a loopback resolver that is not accessible.

**Check the host's DNS:**

```bash
# On the host
cat /etc/resolv.conf
systemctl status systemd-resolved
```

## Fix

### Fix 1: Pin DNS servers in docker-compose.yml (recommended)

Add explicit `dns:` entries to the service definition. This overrides whatever Docker would inherit from the host:

```yaml
services:
  proxyos:
    # ...
    dns:
      - 8.8.8.8
      - 1.1.1.1
```

This is already included in the reference `docker-compose.yml`. If you are using a custom compose file without it, add it.

Then recreate the container:

```bash
docker compose up -d --force-recreate proxyos
```

### Fix 2: Use IP addresses for upstreams

As a short-term workaround while you fix DNS, switch upstream addresses from hostnames to IP addresses. This bypasses DNS resolution entirely.

```
http://192.168.1.50:8080   # instead of http://myservice:8080
```

### Fix 3: Fix host DNS

If your host uses `systemd-resolved` with `cloudflared`:

```bash
# Check resolved status
resolvectl status

# Verify the stub listener is working
dig @127.0.0.53 google.com
```

If the stub resolver is broken, restart it:

```bash
systemctl restart systemd-resolved
```

Then recreate the ProxyOS container to pick up the corrected resolv.conf.

## Prevention

Always include the `dns:` block in your `docker-compose.yml`:

```yaml
dns:
  - 8.8.8.8
  - 1.1.1.1
```

This pins the container to known-good public resolvers regardless of what the host's DNS configuration looks like. The ProxyOS reference compose file includes this by default.

## Related

- [502 Bad Gateway](502-bad-gateway.md)
- [Behind Cloudflare Tunnel](../deployment/behind-cloudflare-tunnel.md)
- [Docker Compose Reference](../getting-started/docker-compose-reference.md)
