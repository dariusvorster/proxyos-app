# API Scopes and Permissions

> API key scopes control which operations a key is permitted to perform.

## What it does

When creating an API key, you select one or more scopes. The API validates that the key's scopes include the required permission before executing a procedure.

Scopes follow a `resource:action` naming convention. Wider scopes (e.g., `routes:write`) imply narrower ones (e.g., `routes:read`).

## Available scopes

| Scope | Description |
|---|---|
| `routes:read` | List and get routes |
| `routes:write` | Create, update, delete, and resync routes |
| `hosts:read` | List and get redirect hosts, error hosts, and streams |
| `hosts:write` | Create, update, delete redirect hosts, error hosts, and streams |
| `analytics:read` | Read traffic metrics, access log, health check history |
| `settings:read` | Read settings, SSO providers, DNS providers, certificates |
| `settings:write` | Modify settings, add/remove providers |
| `admin` | All permissions — use sparingly |

## User roles (dashboard access)

Dashboard users (not API keys) have a `role` field:

| Role | Description |
|---|---|
| `admin` | Full access to all features |
| `operator` | Create and edit routes; cannot modify system settings or user accounts |
| `viewer` | Read-only access to routes, analytics, and status |

Roles are assigned in **Settings → Users**. The first user created on a fresh installation is always assigned `admin`.

## When to use it

- Use `routes:read` for monitoring scripts that only need to list route status
- Use `routes:write` for CI/CD automation that creates or updates routes on deployment
- Use `admin` only for administrative scripts that need full access
- Never use `admin` scope for a key that will be embedded in client-side code

## Troubleshooting

- **403 Forbidden**: The API key has the wrong scope for the procedure being called. Check the key's configured scopes in **Settings → API Keys**.
- **Key not found**: The key may have expired or been revoked. Create a new key.
