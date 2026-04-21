# Federation

> Federation allows a central ProxyOS instance to manage routes on remote ProxyOS agents across multiple hosts or sites.

## What it does

The federation system has two components:

- **Central instance**: The ProxyOS dashboard where you manage everything. Stores the authoritative route configuration.
- **Agents**: Lightweight ProxyOS instances on remote hosts that receive route config pushes from the central instance and apply them to their local Caddy.

Routes can have a `scope` of `exclusive` (managed only by the central instance) or `local_only` (managed locally on the agent). The `origin` field tracks whether a route was created on the central instance (`central`) or the agent (`local`).

The federation hierarchy: Tenant → Organization → Site → Node (agent).

## When to use it

Use federation when you have:
- Multiple physical or virtual hosts each running their own Caddy+ProxyOS
- A homelab with several machines you want to manage from a single dashboard
- A multi-site deployment where each site has its own ProxyOS agent

## How to configure

### Setting up an agent

1. In the central dashboard, go to **Settings → Federation → Agents → New Agent**
2. Generate an enrollment token for the site
3. On the remote host, deploy ProxyOS with the agent flag and enrollment token
4. The agent checks in, appears in the central dashboard, and starts receiving route pushes

Agent status is tracked in the `agents` table (online/offline, last seen, route count, cert count, Caddy version).

### Route scope

- `exclusive`: Route is pushed from central to the agent. Editing is only allowed from the central dashboard.
- `local_only`: Route is managed on the agent itself. The central dashboard has read-only visibility.

## Troubleshooting

- **Agent shows offline**: Check the agent's heartbeat time. The agent sends periodic heartbeats to the central instance. Network connectivity or firewall issues between agent and central can cause this.
- **Route not appearing on agent**: Check the route's `siteId` and `scope`. Only routes assigned to a site and with `scope: exclusive` are pushed to agents.
- **Revoked agent token**: Tokens can be revoked from the central dashboard. A revoked token hash is recorded in `revoked_agent_tokens`.
