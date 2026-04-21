# Troubleshooting — Problem Index

Find your symptom below and follow the link to the detailed fix.

---

## Authentication

| Symptom | Guide |
|---|---|
| Logged in but every page returns 401 | [Not Authenticated](not-authenticated.md) |
| Login succeeds but cookie disappears on refresh | [Cookie Not Persisting](cookie-not-persisting.md) |
| Everyone got logged out after a config change | [Secret Rotation Logout](secret-rotation-logout.md) |

---

## Routing / proxying

| Symptom | Guide |
|---|---|
| Browser shows "This connection is live" instead of your service | [Holding Page Shown](holding-page-shown.md) |
| `502 Bad Gateway` from the browser | [502 Bad Gateway](502-bad-gateway.md) |
| Mixed content warnings in the browser console | [Mixed Content Errors](mixed-content-errors.md) |
| `https://` upstream (Proxmox, PBS port 8006/8007) returns connection refused | [HTTPS Upstream Connection Refused](https-upstream-connection-refused.md) |

---

## TLS / Certificates

| Symptom | Guide |
|---|---|
| DNS errors ("server misbehaving") after rebuilding the container | [Cloudflared DNS Errors](cloudflared-dns-errors.md) |

---

## Health checks

| Symptom | Guide |
|---|---|
| Health check shows red but the service works fine in the browser | [Upstream Health Failed](upstream-health-failed.md) |

---

## UI / saving

| Symptom | Guide |
|---|---|
| Route changes aren't saved or revert | [Routes Not Saving](routes-not-saving.md) |

---

## Container startup

| Symptom | Guide |
|---|---|
| Container exits immediately or stays unhealthy | [Container Won't Start](container-wont-start.md) |
