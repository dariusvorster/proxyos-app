# Federation

Federation lets you manage multiple ProxyOS instances from a single central UI. Each remote instance runs as a **node** and receives configuration pushed from the **central** instance.

---

## Modes

| Mode | `PROXYOS_MODE` | Description |
|---|---|---|
| Standalone | `standalone` | Default. Single instance, self-contained. |
| Central | `central` | Manages remote nodes. Does not proxy traffic itself. |
| Node | `node` | Receives config from central. Runs Caddy locally. |
| Central + Node | `central+node` | Both: manages other nodes and proxies traffic. |

---

## Setting up a central instance

1. Deploy ProxyOS with `PROXYOS_MODE=central`:

```yaml
environment:
  PROXYOS_SECRET: "your-secret-here"
  PROXYOS_MODE: central
  PROXYOS_FEDERATION_PORT: "7890"   # default; port must be reachable by nodes
```

2. Ensure port 7890 is open on the central host.
3. Open the UI and go to **Federation** → **Nodes**.
4. Click **Generate Enrollment Token** to create a token for each node you intend to enroll.

---

## Enrolling a node

On the node host, deploy ProxyOS with `PROXYOS_MODE=node`:

```yaml
environment:
  PROXYOS_SECRET: "your-node-secret-here"  # can differ from central
  PROXYOS_MODE: node
  PROXYOS_CENTRAL_URL: "wss://central.example.com:7890"
  PROXYOS_AGENT_TOKEN: "enrollment-token-from-central"
  PROXYOS_AGENT_NAME: "node-eu-west-1"     # display name in central UI
```

When the container starts, the node connects to the central instance over WebSocket, authenticates with the token, and registers itself. It appears in the central UI under **Federation** → **Nodes** within a few seconds.

---

## How config sync works

After enrollment:

- Routes created or modified on the central UI are pushed to relevant nodes via the federation WebSocket.
- Each node applies the received config to its local Caddy instance immediately.
- The central UI shows each node's sync status and last-seen timestamp.

**What gets pushed:**
- Routes assigned to that node (domain, upstream, TLS mode, headers, WAF rules, access lists)
- TLS configuration (certificate issuance still happens locally on each node — Caddy on each node handles its own certificates)

**What stays local on each node:**
- Caddy TLS state (`/data/caddy`) — certificates are not transferred
- Access logs and analytics data
- The node's own SQLite database

### Offline behaviour

If a node loses connectivity to the central instance:

- Caddy continues serving all routes that were last pushed successfully.
- The node buffers incoming config changes and applies them once reconnected.
- No routes are removed automatically during an outage.

---

## Environment variables by mode

### Central

| Variable | Required | Description |
|---|---|---|
| `PROXYOS_SECRET` | Yes | Auth secret for the central UI |
| `PROXYOS_MODE` | Yes | Set to `central` or `central+node` |
| `PROXYOS_FEDERATION_PORT` | No | WebSocket listener port (default: `7890`) |

### Node

| Variable | Required | Description |
|---|---|---|
| `PROXYOS_SECRET` | Yes | Auth secret for the local node UI (if any) |
| `PROXYOS_MODE` | Yes | Set to `node` or `central+node` |
| `PROXYOS_CENTRAL_URL` | Yes | WebSocket URL of the central instance |
| `PROXYOS_AGENT_TOKEN` | Yes | Enrollment token generated on central |
| `PROXYOS_AGENT_NAME` | No | Display name shown in central UI |

---

## Revoking a node

In the central UI, go to **Federation** → **Nodes**, find the node, and click **Revoke**. The node's token is invalidated and it will be disconnected. Its local Caddy routes continue running until manually cleared or the node is redeployed.
