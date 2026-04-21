# Problem: Holding Page Shown Instead of Service

## Symptoms

- Navigating to your proxied domain shows a dark card that reads **"This connection is live"**
- The card says: "ProxyOS has routed this domain successfully. Your upstream service hasn't responded yet — start it or update the upstream address in ProxyOS to complete the setup."
- TLS works (valid certificate, green padlock)
- Your actual service is not visible

## Why this happens

The holding page is ProxyOS's designed response when Caddy can reach the route but the upstream connection fails. It means:

1. The route is correctly configured in Caddy — the domain is matched and TLS is working
2. The upstream address is not responding — either the service is down, the address is wrong, or the port is unreachable

This is intentional. Rather than showing Caddy's default 502 error, ProxyOS serves an informative page that tells you the proxy layer is healthy and the problem is the upstream.

The holding page HTML is served as a static 200 response by the `reverse_proxy` handler's error handling. It is not a 502.

## Diagnosis

**1. Check if the upstream is actually running:**

```bash
# From the host
curl -v http://your-upstream-ip:port

# From inside the ProxyOS container (tests container network reachability)
docker compose exec proxyos wget -qO- http://your-upstream-ip:port
```

**2. Check the route's upstream address in the dashboard:**

- Navigate to the route in the ProxyOS dashboard
- Confirm the upstream address is correct — right IP/hostname, right port, right scheme

**3. Check the health check status:**

The route detail page shows recent health check results. If the health check is failing, the upstream is confirmed unreachable.

**4. Check Docker networking:**

If your upstream is a Docker container, it must be on a network that ProxyOS can reach.

```bash
docker network ls
docker inspect your-upstream-container | grep -A5 Networks
```

ProxyOS needs to share a Docker network with the upstream container, or the upstream must be reachable by IP from the host network.

## Fix

### Fix 1: Start or fix the upstream service

The most common cause. Start your service and reload the page.

### Fix 2: Correct the upstream address

In the ProxyOS dashboard, edit the route and update the upstream:

- Use the container name if on a shared Docker network: `http://container-name:port`
- Use the host IP if the service is on the host: `http://192.168.1.x:port`
- Use `host.docker.internal` to reach the Docker host from inside a container (on Docker Desktop / some setups)

### Fix 3: Join the Docker network

If the upstream is a Docker container:

```bash
# Find the upstream container's network
docker inspect upstream-container --format '{{json .NetworkSettings.Networks}}'

# Connect ProxyOS to that network
docker network connect upstream-network proxyos
```

Or use ProxyOS's Docker Networks feature in the dashboard (Settings → Docker Networks) to join networks automatically.

### Fix 4: HTTPS upstream

If the upstream uses HTTPS (e.g., Proxmox on port 8006), prefix the address with `https://`:

```
https://proxmox-host:8006
```

See [HTTPS Upstream Connection Refused](https-upstream-connection-refused.md).

## Prevention

- Set a health check on the route so you get notified when the upstream goes down
- Use Docker network auto-join for containerised upstreams
- Verify the upstream address with a `curl` from inside the ProxyOS container before saving the route

## Related

- [502 Bad Gateway](502-bad-gateway.md)
- [HTTPS Upstream Connection Refused](https-upstream-connection-refused.md)
- [Upstream Health Failed](upstream-health-failed.md)
