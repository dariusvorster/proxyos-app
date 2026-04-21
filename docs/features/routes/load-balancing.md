# Load Balancing

> Load balancing distributes incoming requests across multiple upstream addresses.

## What it does

When a route has more than one upstream, ProxyOS configures Caddy's `load_balancing` block with the selected policy. Caddy selects an upstream for each incoming request according to the policy and tracks upstream health to remove failed backends automatically.

## When to use it

Use multiple upstreams when you have:
- Multiple replicas of a service running behind ProxyOS
- An active-passive failover pair (primary + hot standby)
- A blue-green deployment with a traffic split (see Upstream Configuration)

## How to configure

Add multiple upstream addresses on the route. Then select a **Load Balancing Policy**:

| Policy | Description |
|---|---|
| `round_robin` | Rotate through upstreams in order (default) |
| `least_conn` | Send to the upstream with the fewest active connections |
| `ip_hash` | Hash the client IP — same client always hits the same upstream (session affinity) |
| `random` | Random selection on each request |
| `weighted_round_robin` | Round-robin weighted by the `weight` field on each upstream |

To use `weighted_round_robin`, set a numeric `weight` on each upstream entry (higher weight = more traffic).

### Blue-green / traffic split

Set a **Staging Upstreams** list and a **Traffic Split %**. ProxyOS uses `weighted_round_robin` internally with the split percentage applied to the staging group and the remainder to production upstreams.

## Troubleshooting

- If all upstreams fail health checks, Caddy continues sending to all upstreams (it does not return 503 with all upstreams down — check Caddy behavior for your version)
- `ip_hash` does not guarantee affinity through Cloudflare (the IP seen by Caddy is the Cloudflare edge IP, not the visitor IP, unless `trusted_proxies` is properly configured)
