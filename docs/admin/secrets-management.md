# Secrets Management

> How ProxyOS handles sensitive values and how to integrate external secrets providers.

## What it does

ProxyOS requires `PROXYOS_SECRET` as the one mandatory secret. Additional sensitive values (DNS provider API keys, SSO client secrets, OAuth credentials) are stored encrypted in the database.

ProxyOS supports integration with external secrets providers to avoid storing secrets directly in the database or `.env` file.

## When to use it

Use a secrets provider when:
- Your organization requires secrets to be stored in a vault
- You want to rotate secrets without editing `docker-compose.yml` or `.env`
- You integrate with LockBoxOS (the Homelab OS secrets manager)

## How to configure

### Minimum: .env file

The simplest approach for personal homelab use:

```env
PROXYOS_SECRET=your-64-char-secret
```

Keep this file out of version control. Back it up securely.

### Secrets providers

ProxyOS supports three provider types (stored in `secrets_providers` table):

| Type | Description |
|---|---|
| `lockboxos` | LockBoxOS (Homelab OS family secrets manager) |
| `vault` | HashiCorp Vault |
| `env` | Environment variable passthrough (for CI/CD) |

Configure a provider in **Settings → Secrets Providers**. Once a provider is connected, credentials entered in ProxyOS (DNS API keys, SSO secrets, etc.) can be stored as references to vault paths rather than as plaintext.

LockBoxOS references are stored in the `lockbox_refs` table, tracking the credential key, vault ID, and secret path.

### Credential encryption at rest

Sensitive credentials stored directly in the database (DNS provider credentials, OAuth client secrets) are stored as JSON in the relevant table columns. These columns should be treated as sensitive if you ever export the database.

## Troubleshooting

- **Secret rotation logging everyone out**: see [Secret Rotation Logout](../troubleshooting/secret-rotation-logout.md)
- **LockBoxOS provider failing**: verify the LockBoxOS connection URL and token are correct in Settings → Connections
