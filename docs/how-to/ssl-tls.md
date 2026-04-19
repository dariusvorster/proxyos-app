# SSL/TLS

ProxyOS supports four TLS modes per route. Select the mode when creating or editing a route.

---

## Auto (ACME HTTP-01)

Caddy requests a certificate from Let's Encrypt (or ZeroSSL) using the HTTP-01 challenge.

**Requirements:**
- Port 80 must be publicly reachable from the internet
- The route's domain must resolve to this server's public IP

**When to use:** Any public-facing service where port 80 is open. This is the default and requires no extra configuration.

**How it works:** When the route is first served, Caddy automatically requests a certificate. Renewal happens automatically before expiry. No action is required after route creation.

---

## DNS-01 via Cloudflare

Caddy proves domain ownership by creating a temporary DNS TXT record via the Cloudflare API, then removes it. Port 80 does not need to be reachable.

**Requirements:**
- `CLOUDFLARE_API_TOKEN` environment variable set with `Zone:DNS:Edit` permission
- Domain DNS hosted on Cloudflare

**When to use:**
- Server is behind NAT and port 80 is not forwarded
- Internal/private services that should still have a valid public certificate
- Wildcard certificates

**Setup:**
1. Create a Cloudflare API token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) with `Zone:DNS:Edit` scoped to your zone.
2. Set the token in your compose file:

```yaml
environment:
  CLOUDFLARE_API_TOKEN: "your-token-here"
```

3. Restart the container.
4. When creating a route, select **TLS: DNS-01**.

Caddy handles the rest. Certificates are issued and renewed automatically.

---

## Internal CA

Caddy issues a self-signed certificate from its own internal certificate authority.

**Requirements:** None — no internet access or DNS control needed.

**When to use:**
- Fully local/private services with no public DNS
- Development environments
- Services accessed only by other systems that can trust the internal CA

**Trusting the internal CA:**

The Caddy internal CA root certificate can be found at `/data/caddy/pki/authorities/local/root.crt` inside the container. Install it in your browser or OS trust store to avoid certificate warnings.

```bash
docker cp proxyos:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

On macOS:
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain caddy-root.crt
```

On Linux:
```bash
sudo cp caddy-root.crt /usr/local/share/ca-certificates/caddy-root.crt
sudo update-ca-certificates
```

---

## Off (HTTP only)

No TLS. Traffic is served over plain HTTP on port 80.

**When to use:**
- Local testing
- Services already behind another TLS terminator
- Backends that must receive plain HTTP (e.g. some health check endpoints)

**Note:** Caddy will not redirect HTTP to HTTPS for routes with TLS mode Off. Clients receive HTTP responses directly.

---

## TLS mode comparison

| Mode | Port 80 required | Internet required | Certificate authority | Use case |
|---|---|---|---|---|
| Auto | Yes | Yes | Let's Encrypt / ZeroSSL | Standard public HTTPS |
| DNS-01 | No | Yes (DNS API only) | Let's Encrypt / ZeroSSL | Behind NAT, wildcard certs |
| Internal | No | No | Caddy internal CA | Private/local services |
| Off | No | No | None | HTTP only |
