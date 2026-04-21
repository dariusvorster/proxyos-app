# Problem: HTTPS Upstream Connection Refused

## Symptoms

- A route for Proxmox (port 8006), PBS (port 8007), or another HTTPS-only service returns 502 or the holding page
- Logs show `connection refused` or `tls: first record does not look like a TLS handshake`
- The service works fine when accessed directly (e.g., `https://proxmox.lan:8006`)
- The route upstream is set to `proxmox.lan:8006` without a scheme

## Why this happens

Caddy defaults to dialing upstreams over plain HTTP. If the upstream is HTTPS-only (like Proxmox, Proxmox Backup Server, or any service that redirects HTTP to HTTPS on the same port or flat-out rejects non-TLS), the connection fails because Caddy sends an HTTP request to a port that expects a TLS handshake.

ProxyOS has auto-detection for a set of well-known HTTPS ports:

```
443, 8006, 8007, 8443, 9090, 9443, 10443
```

If your upstream address uses one of these ports **without** an `http://` prefix, ProxyOS auto-detects it as HTTPS and enables the TLS transport block in Caddy, including `insecure_skip_verify: true` (because self-signed certs are the norm on services like Proxmox).

The problem occurs when:
1. You prefix the upstream with `http://` explicitly, overriding auto-detection
2. The HTTPS service is on a non-standard port not in the auto-detection list

## Diagnosis

**Test what happens without ProxyOS:**

```bash
# This should fail (wrong scheme)
curl http://proxmox.lan:8006

# This should work
curl -k https://proxmox.lan:8006
```

**Check the route's upstream address in the dashboard:**

Look at the upstream field. Does it have `http://` as a prefix? If so, change it to `https://` or remove the scheme prefix entirely (and let auto-detection kick in for known ports).

**Check container logs:**

```bash
docker compose logs proxyos | grep "tls\|handshake\|proxmox"
```

Look for `tls: first record does not look like a TLS handshake` — this is the definitive sign that Caddy is dialing HTTP to an HTTPS port.

## Fix

### Fix 1: Use the `https://` prefix in the upstream address

Edit the route and change the upstream from:
```
proxmox.lan:8006
```
to:
```
https://proxmox.lan:8006
```

ProxyOS will set `insecure_skip_verify: true` automatically when the `https://` prefix is present (because Proxmox and PBS use self-signed certificates).

### Fix 2: Remove the `http://` prefix

If you have `http://proxmox.lan:8006`, change it to `proxmox.lan:8006` (no scheme). Port `8006` is in the auto-detection list so ProxyOS will detect it as HTTPS and handle it correctly.

### Fix 3: Enable Skip TLS Verify for custom HTTPS ports

If your HTTPS service is on a port not in the auto-detection list:
1. Use `https://your-service:custom-port` as the upstream
2. Enable **Skip TLS Verify** on the route if the upstream uses a self-signed certificate

## Prevention

- Always test upstream connectivity from inside the container before saving the route
- For Proxmox, PBS, and similar services, use `https://host:port` as the upstream address

## Related

- [502 Bad Gateway](502-bad-gateway.md)
- [Holding Page Shown](holding-page-shown.md)
- [Upstream Configuration](../features/routes/upstream-configuration.md)
