# WAF (Web Application Firewall)

> The WAF feature uses Coraza (OWASP Core Rule Set) to detect or block malicious HTTP requests.

## What it does

ProxyOS includes the [coraza-caddy](https://github.com/corazawaf/coraza-caddy) plugin, which implements the OWASP Core Rule Set (CRS) as a Caddy middleware. In `detect` mode, suspicious requests are logged. In `blocking` mode, they are rejected with `403 Forbidden`.

The WAF handler runs before the reverse proxy handler in the middleware chain, so blocked requests never reach the upstream.

## When to use it

Enable WAF on routes that:
- Accept user-generated input (forms, search, file uploads)
- Are exposed to the public internet
- Handle authentication or session management
- Serve APIs where SQL injection, XSS, or path traversal are concerns

## How to configure

Edit a route and set **WAF Mode**:

| Mode | Behavior |
|---|---|
| `off` | WAF disabled (default) |
| `detect` | Log matches but allow requests through |
| `blocking` | Block requests that match rules (return 403) |

### Rule exclusions

If the WAF blocks legitimate requests (false positives), add rule exclusions by entering the Coraza rule IDs to suppress. Each exclusion disables that specific CRS rule for the route.

To find the rule ID for a false positive:
1. Set WAF to `detect` mode
2. Make the legitimate request that would be blocked
3. Check the ProxyOS logs for WAF events — the log entry includes the rule ID
4. Add that rule ID to **WAF Exclusions**

WAF events (detected and blocked) are stored in the `waf_events` table and visible on the route analytics page.

## Troubleshooting

- Legitimate requests blocked: switch to `detect` mode, find the rule ID in WAF events, add it to exclusions, then switch back to `blocking`
- WAF not catching attacks: ensure mode is `blocking`, not `detect`
- High false positive rate: consider using `detect` mode and reviewing events before enabling `blocking`
