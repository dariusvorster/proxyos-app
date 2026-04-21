# Your First Route

This guide walks through creating a route that exposes a local nginx container through ProxyOS.

---

## Prerequisites

- ProxyOS is running and healthy (see [Installation](installation.md))
- You have a service to expose — this guide uses nginx but any HTTP service works
- A domain name or local hostname that resolves to your ProxyOS host

---

## Step 1 — Start a test upstream

```bash
docker run -d --name test-nginx -p 8080:80 nginx
```

Verify it responds:

```bash
curl http://localhost:8080
```

---

## Step 2 — Open the dashboard

Navigate to `http://your-host:3091` (replace with your `PROXYOS_DASHBOARD_PORT`).

If this is your first time, you will see an account creation form. Fill in an email and password and submit.

---

## Step 3 — Create a route

1. Click **Routes** in the left sidebar.
2. Click **New Route**.
3. Fill in the form:

| Field | Example value | Notes |
|---|---|---|
| Name | `Test nginx` | Human-readable label, shown in the dashboard |
| Domain | `nginx.yourdomain.com` | The hostname Caddy will listen on |
| Upstream | `http://your-host-ip:8080` | Address of your backend service |
| TLS Mode | `auto` | Let's Encrypt HTTP-01 challenge — needs port 80 open and a public domain |

4. Click **Save**.

ProxyOS immediately pushes the route to Caddy via the Admin API on `localhost:2019`. No restart needed.

---

## Step 4 — Test the route

```bash
curl -v https://nginx.yourdomain.com
```

You should receive the nginx welcome page with a valid TLS certificate.

For a local/LAN domain where `auto` TLS won't work, set TLS Mode to `internal` — Caddy will issue a self-signed cert from its internal CA:

```bash
curl -k https://nginx.local
```

---

## Step 5 — Check the Sync column

Back in the dashboard, the **Sync** column on the Routes list shows the roundtrip verification status:

| Status | Meaning |
|---|---|
| `synced` | Caddy config matches what ProxyOS expects |
| `drift` | Caddy config differs from the database — click **Re-push** to fix |
| `—` | Not yet verified (verification runs every 30 s) |

---

## What happens if the upstream isn't running?

If your upstream isn't reachable, Caddy will still accept the connection (the route is live) but will return a **holding page** that says "This connection is live — your upstream service hasn't responded yet." This is intentional — the route is correctly configured, the upstream just isn't up. Start your upstream service and the next request will succeed.

See [Holding page shown](../troubleshooting/holding-page-shown.md) for more detail.

---

## Next steps

- Configure health checks so ProxyOS knows when the upstream is down
- Enable compression and HTTP/2 (both on by default)
- Add rate limiting or WAF protection
- Set up [SSO / Forward Auth](../features/sso.md) to restrict access
