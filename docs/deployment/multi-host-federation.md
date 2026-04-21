# Deployment: Multi-Host Federation

> Running a central ProxyOS instance that manages agents on multiple remote hosts.

## What it does

In a federated deployment, one ProxyOS instance acts as the central management dashboard. Remote ProxyOS agents are deployed on other hosts. The central instance pushes route configuration to agents, and agents apply it to their local Caddy instances.

See [Federation](../features/federation.md) for conceptual details.

## When to use it

Use federation for:
- Managing proxy configuration across multiple physical or virtual machines from a single dashboard
- Multi-site homelab setups
- Delegating site-level management while maintaining central oversight

## How to configure

### 1. Deploy the central instance

Deploy ProxyOS normally on the management host. This instance will have the dashboard you work with day-to-day.

```bash
docker compose up -d
```

### 2. Create the federation hierarchy

In the central dashboard:
1. Go to **Settings → Federation**
2. Create a **Tenant** (top-level org)
3. Create an **Organization** within the tenant
4. Create a **Site** within the organization (one site per physical location or host group)

### 3. Generate an enrollment token

In the central dashboard, go to the site and generate an enrollment token. Tokens expire after a configurable period and can only be used once.

### 4. Deploy an agent on the remote host

On the remote host, deploy ProxyOS with the agent configuration pointing to the central instance and using the enrollment token. The agent enrolls, appears in the central dashboard with status `connected`, and begins receiving route pushes.

### 5. Assign routes to the site

When creating or editing routes in the central dashboard, set the **Site** field to assign the route to a specific agent. Routes with `scope: exclusive` are pushed to the assigned agent.

### Network requirements

The central instance must be able to reach the agent (or the agent must be able to poll the central instance — depending on the push/pull model). Typically:
- Central instance reachable from agents over HTTPS
- Agents do not need to be publicly reachable from the central instance if using a pull model

## Troubleshooting

- **Agent offline**: Check the agent's `lastHeartbeatAt` timestamp. If stale, check network connectivity between agent and central.
- **Route not pushed**: Verify `siteId` is set on the route and `scope` is `exclusive`
- **Token expired**: Generate a new enrollment token and re-enroll the agent
