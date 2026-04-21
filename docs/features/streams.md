# Streams (TCP/UDP Forwarding)

> Streams forward raw TCP or UDP traffic from a listen port to an upstream host and port, without HTTP parsing.

## What it does

ProxyOS uses the `caddy-l4` (Layer 4) plugin to create port-level forwarding rules. A stream listens on a TCP and/or UDP port on the host and forwards all bytes to the configured upstream. There is no HTTP processing, TLS termination, or header manipulation.

Streams are stored in the `streams` table.

## When to use it

Use streams for:
- Database connections (MySQL on 3306, PostgreSQL on 5432, Redis on 6379)
- MQTT brokers (1883, 8883)
- Game servers with custom TCP/UDP protocols
- SSH access (`ProxyJump` style forwarding)
- Any service that does not speak HTTP

For HTTP/HTTPS services, use a standard route instead — you get TLS, health checks, and analytics.

## How to configure

Navigate to **Hosts → Streams → New Stream**:

| Field | Default | Description |
|---|---|---|
| Listen port | — | Port ProxyOS binds on the host. Must be unique. |
| Protocol | `tcp` | `tcp`, `udp`, or `tcp+udp` |
| Upstream host | — | Hostname or IP of the target service |
| Upstream port | — | Port of the target service |
| Enabled | `true` | Toggle the stream on/off |

### Port binding

The listen port is bound on the container's host interface via the `EXPOSE` / port mapping in docker-compose. To make a stream's port accessible from outside the container, you must add a port mapping to `docker-compose.yml`:

```yaml
ports:
  - "3306:3306"   # MySQL stream example
```

## Troubleshooting

- **Port already in use**: Another service or stream is already bound to that listen port. Choose a different port.
- **Connection refused from outside**: The stream listen port must also be published in the Docker port mapping. Add the port to your compose file.
- **UDP forwarding not working**: Ensure the protocol is set to `udp` or `tcp+udp`, and the Docker port mapping includes `/udp`: `"1883:1883/udp"`
