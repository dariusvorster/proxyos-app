# Docker Networks

> Docker network auto-discovery allows ProxyOS to join container networks so it can reach upstream services by container name.

## What it does

ProxyOS mounts the Docker socket (`/var/run/docker.sock`) read-only and scans for Docker networks. When ProxyOS joins a network, it can reach containers on that network by name (e.g., `http://my-app:3000`) without needing to know the container's IP address.

Discovered networks are stored in the `discovered_networks` table. Events (join, leave, failure) are stored in `network_sync_events`.

## When to use it

Use Docker network auto-discovery when:
- Your upstream services are Docker containers on networks that ProxyOS is not already connected to
- You want to use container names (not IPs) as upstream addresses — container IPs change on restart but names are stable
- You run a large number of containers across multiple Compose projects

## How to configure

Go to **Settings → Docker Networks**. ProxyOS displays all discovered Docker networks with their status:

| Status | Meaning |
|---|---|
| `available` | Network exists but ProxyOS has not joined it |
| `joined` | ProxyOS is connected to this network |
| `excluded` | You have explicitly excluded this network |
| `unreachable` | Network was seen but is no longer available |

Click **Join** to connect ProxyOS to a network. Click **Leave** to disconnect. Click **Exclude** to hide a network from the list permanently.

**Well-known networks** (e.g., `bridge`, `host`, `none`) are flagged with a `wellKnownPurpose` label and are typically not useful to join.

## Troubleshooting

- **Container name not resolving**: Verify ProxyOS has joined the network that the target container is on
- **Docker socket not available**: Check the `docker-compose.yml` includes the `/var/run/docker.sock:/var/run/docker.sock:ro` volume mount
- **Network shown as `unreachable`**: The network may have been removed. Refresh the networks list.
