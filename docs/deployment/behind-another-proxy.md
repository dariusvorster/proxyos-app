# Deployment: Behind Another Reverse Proxy

> Running ProxyOS behind nginx, Traefik, HAProxy, or another reverse proxy on the same host.

## What it does

In some setups ProxyOS is not the first proxy in the chain. Another reverse proxy handles incoming connections, terminates TLS, and forwards requests to ProxyOS's dashboard or to Caddy's HTTP port.

## When to use it

Use this topology when:
- You have an existing nginx or Traefik setup and want to add ProxyOS without changing port 443
- ProxyOS manages a subset of domains, and other services manage the rest
- You want the outer proxy to handle SSL certificates for ProxyOS itself

## How to configure

### Step 1: Bind ProxyOS to non-standard ports

In `.env`:

```env
PROXYOS_HTTP_PORT=8080
PROXYOS_HTTPS_PORT=8443
PROXYOS_DASHBOARD_PORT=3091
```

### Step 2: Configure the outer proxy

**nginx example** (forwarding to ProxyOS HTTP port):

```nginx
server {
    listen 443 ssl;
    server_name *.yourdomain.com;

    ssl_certificate /etc/ssl/certs/yourdomain.crt;
    ssl_certificate_key /etc/ssl/private/yourdomain.key;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Step 3: Ensure the outer proxy IP is in trusted_proxies

The outer proxy's IP must be in ProxyOS's `trusted_proxies` list. If it's on the same host (`127.0.0.1`) or on the Docker bridge network, it is already covered by the default ranges (loopback and RFC1918).

For an external proxy, the IP must be in an RFC1918 range or you need to customize `trusted_proxies`.

### Step 4: TLS mode for routes

If the outer proxy handles TLS and sends plain HTTP to ProxyOS, set route TLS modes to `off`. Caddy will not provision certificates for these routes. The outer proxy's certificate covers them.

Alternatively, set TLS mode to `internal` and configure the outer proxy with `proxy_ssl_verify off` (nginx) or `insecureskipverify: true` (Traefik).

## Troubleshooting

- Mixed content errors: ensure `X-Forwarded-Proto: https` is set by the outer proxy and that the outer proxy's IP is in `trusted_proxies`
- See [Mixed Content Errors](../troubleshooting/mixed-content-errors.md) and [Trusted Proxies](trusted-proxies.md)
