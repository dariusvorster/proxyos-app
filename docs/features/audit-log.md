# Audit Log

> The audit log records every create, update, and delete action taken on ProxyOS resources.

## What it does

Every mutating operation in ProxyOS (creating a route, updating an upstream, enabling SSO, etc.) writes an entry to the `audit_log` table. Each entry records:

- `action` — the operation performed (e.g., `route.create`, `route.update`, `user.login`)
- `resourceType` — the type of resource affected (e.g., `route`, `sso_provider`, `user`)
- `resourceId` — the ID of the affected resource
- `resourceName` — the human-readable name at the time of the action
- `actor` — who performed the action (user email or `system` for automated actions)
- `detail` — JSON blob with additional context
- `createdAt` — timestamp

## When to use it

Use the audit log to:
- Investigate unexpected changes to routes or configuration
- Track which user made a change and when
- Audit access and authentication events
- Compliance requirements for change management

## How to configure

The audit log is always active and requires no configuration. It is accessible at **Settings → Audit Log** in the dashboard.

The log is append-only by design — entries are never modified or deleted by the application.

**Retention**: The audit log grows indefinitely. If storage is a concern, periodically export old entries and delete them from the database manually, or rely on the database backup/restore process.

## Troubleshooting

- **Missing entries**: Not all operations may be logged in all versions. If you expect a specific action to appear and it doesn't, check whether the relevant tRPC procedure calls the audit log writer.
- **Large audit log**: Use the filter and date range controls in the dashboard UI to narrow results. For bulk export, query the `audit_log` table directly via SQLite.
