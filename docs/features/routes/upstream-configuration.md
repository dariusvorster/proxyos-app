# Upstream Configuration

> An upstream is the backend address that Caddy reverse-proxies traffic to.

## What it does

Each route has one or more upstream addresses. Caddy dials the upstream, forwards the request, and returns the response to the client. Multiple upstreams activate load balancing.

## When to use it

Configure upstreams when you have:
- A single backend service (one upstream)
- Multiple replicas of a service to load balance across (multiple upstreams)
- A blue-green deployment with a staging upstream and traffic split percentage

## How to configure

### Upstream address format

```
http://hostname:port        Plain HTTP upstream
https://hostname:port       HTTPS upstream (TLS transport enabled)
hostname:port               Scheme inferred from port (see auto-detection)
```

**Auto-detection for HTTPS ports:** If the port is `443`, `8006`, `8007`, `8443`, `9090`, `9443`, or `10443` and no `http://` prefix is set, ProxyOS automatically enables the HTTPS transport and sets `insecure_skip_verify: true` (for self-signed certs common on services like Proxmox and PBS).

### Skip TLS verify

Enable **Skip TLS Verify** on the route if the upstream uses a self-signed certificate that you cannot add to Caddy's trust store. This disables certificate verification for the upstream connection only — the public-facing TLS (between the browser and Caddy) is unaffected.

### Multiple upstreams

Add multiple upstream addresses to enable load balancing. See [Load Balancing](load-balancing.md) for policy options.

### Blue-green / traffic split

Set staging upstreams and a **Traffic Split %** to send a percentage of traffic to the staging upstreams while the rest goes to production upstreams. The split uses weighted round-robin internally.

## Troubleshooting

- `https://` upstreams returning connection refused: see [HTTPS Upstream Connection Refused](../../troubleshooting/https-upstream-connection-refused.md)
- Upstream unreachable from container: check Docker network membership (Settings → Docker Networks)
- Self-signed cert errors: enable Skip TLS Verify on the route
