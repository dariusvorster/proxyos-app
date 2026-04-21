# Creating Routes

> A route maps an incoming hostname to one or more upstream services and is the primary object in ProxyOS.

## What it does

When you create a route, ProxyOS writes the configuration to its SQLite database and immediately pushes a Caddy route entry to the Caddy Admin API. Caddy begins accepting requests for the domain without a restart.

## When to use it

Create a route whenever you want to expose an HTTP or HTTPS service at a domain name. For pure redirects use a [Redirect Host](../redirect-hosts.md). For error pages use an [Error Host](../error-hosts.md). For raw TCP/UDP forwarding use [Streams](../streams.md).

## How to configure

1. Click **Routes** in the sidebar, then **New Route**
2. Fill in the required fields:

| Field | Required | Description |
|---|---|---|
| Name | Yes | Human-readable label shown in the dashboard |
| Domain | Yes | Hostname Caddy will match (e.g. `app.yourdomain.com`) |
| Upstream | Yes | Backend address (e.g. `http://192.168.1.10:3000`) |
| TLS Mode | Yes | How Caddy obtains the certificate (default: `auto`) |

3. Click **Save** — the route is live immediately

Multiple upstreams can be added for load balancing. All other settings (health checks, WAF, rate limiting, headers, etc.) are optional and can be configured after creation on the route detail page.

## Troubleshooting

- If the domain is already in use by another route, redirect host, or error host, the save will fail with a validation error
- If the route saves but the Sync column shows `drift`, click **Re-push** on the route detail page
- If traffic shows the holding page, the upstream is not reachable — see [Holding Page Shown](../../troubleshooting/holding-page-shown.md)
