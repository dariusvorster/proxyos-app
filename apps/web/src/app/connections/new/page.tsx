'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Input } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

interface AdapterMeta {
  type: string
  label: string
  description: string
  credFields: { key: string; label: string; secret?: boolean }[]
}

const ADAPTERS: { category: string; items: AdapterMeta[] }[] = [
  {
    category: 'CDN / Cloud',
    items: [
      {
        type: 'cloudflare',
        label: 'Cloudflare',
        description: 'DNS, Tunnel, WAF, Analytics, Zero Trust Access',
        credFields: [
          { key: 'apiToken', label: 'API Token', secret: true },
          { key: 'accountId', label: 'Account ID' },
          { key: 'zoneId', label: 'Zone ID (optional)' },
          { key: 'originIp', label: 'Proxy origin IP (for DNS records)' },
          { key: 'tunnelId', label: 'Tunnel ID (optional)' },
        ],
      },
    ],
  },
  {
    category: 'Identity',
    items: [
      {
        type: 'authentik',
        label: 'Authentik',
        description: 'Outpost management, automatic app provisioning',
        credFields: [
          { key: 'url', label: 'Authentik URL' },
          { key: 'token', label: 'API Token', secret: true },
        ],
      },
      {
        type: 'authelia',
        label: 'Authelia',
        description: 'Config writer for forward-auth integration',
        credFields: [
          { key: 'configPath', label: 'Config file path' },
        ],
      },
      {
        type: 'keycloak',
        label: 'Keycloak',
        description: 'Client management for OIDC integration',
        credFields: [
          { key: 'url', label: 'Keycloak URL' },
          { key: 'realm', label: 'Realm' },
          { key: 'clientId', label: 'Admin Client ID' },
          { key: 'clientSecret', label: 'Admin Client Secret', secret: true },
        ],
      },
      {
        type: 'zitadel',
        label: 'Zitadel',
        description: 'Application management for SSO integration',
        credFields: [
          { key: 'url', label: 'Zitadel URL' },
          { key: 'serviceAccountKey', label: 'Service Account Key (JSON)', secret: true },
        ],
      },
    ],
  },
  {
    category: 'DNS',
    items: [
      {
        type: 'hetzner_dns',
        label: 'Hetzner DNS',
        description: 'Hetzner DNS zone and record management',
        credFields: [
          { key: 'apiToken', label: 'API Token', secret: true },
        ],
      },
      {
        type: 'route53',
        label: 'AWS Route 53',
        description: 'Route 53 hosted zone and record management',
        credFields: [
          { key: 'accessKeyId', label: 'Access Key ID' },
          { key: 'secretAccessKey', label: 'Secret Access Key', secret: true },
          { key: 'region', label: 'Region' },
        ],
      },
      {
        type: 'namecheap',
        label: 'Namecheap',
        description: 'Namecheap DNS record management via API',
        credFields: [
          { key: 'username', label: 'Username' },
          { key: 'apiKey', label: 'API Key', secret: true },
        ],
      },
    ],
  },
  {
    category: 'Tunnels',
    items: [
      {
        type: 'tailscale',
        label: 'Tailscale Funnel',
        description: 'Tailscale Funnel ingress rule management',
        credFields: [
          { key: 'apiKey', label: 'API Key', secret: true },
          { key: 'tailnet', label: 'Tailnet name' },
        ],
      },
      {
        type: 'wireguard',
        label: 'WireGuard',
        description: 'WireGuard tunnel monitoring (read-only)',
        credFields: [
          { key: 'interfaceName', label: 'Interface name (e.g. wg0)' },
        ],
      },
    ],
  },
  {
    category: 'Monitoring',
    items: [
      {
        type: 'uptime_kuma',
        label: 'Uptime Kuma',
        description: 'Auto-create monitors when routes are exposed',
        credFields: [
          { key: 'url', label: 'Uptime Kuma URL' },
          { key: 'username', label: 'Username' },
          { key: 'password', label: 'Password', secret: true },
        ],
      },
      {
        type: 'betterstack',
        label: 'Betterstack',
        description: 'Betterstack Uptime monitor management',
        credFields: [
          { key: 'apiToken', label: 'API Token', secret: true },
        ],
      },
      {
        type: 'freshping',
        label: 'Freshping',
        description: 'Freshping check creation and status sync',
        credFields: [
          { key: 'apiKey', label: 'API Key', secret: true },
        ],
      },
    ],
  },
  {
    category: 'Notifications',
    items: [
      {
        type: 'zulip',
        label: 'Zulip',
        description: 'Send alerts to a Zulip stream',
        credFields: [
          { key: 'serverUrl', label: 'Server URL' },
          { key: 'email', label: 'Bot email' },
          { key: 'apiKey', label: 'Bot API Key', secret: true },
          { key: 'stream', label: 'Stream name' },
          { key: 'topic', label: 'Topic (optional)' },
        ],
      },
      {
        type: 'slack',
        label: 'Slack',
        description: 'Send alerts to a Slack channel via webhook',
        credFields: [
          { key: 'webhookUrl', label: 'Webhook URL', secret: true },
        ],
      },
      {
        type: 'webhook',
        label: 'Webhook',
        description: 'Send alerts to any HTTP endpoint',
        credFields: [
          { key: 'url', label: 'Webhook URL' },
          { key: 'secret', label: 'HMAC secret (optional)', secret: true },
        ],
      },
      {
        type: 'smtp',
        label: 'SMTP',
        description: 'Send alert emails via SMTP',
        credFields: [
          { key: 'host', label: 'SMTP host' },
          { key: 'port', label: 'Port' },
          { key: 'username', label: 'Username' },
          { key: 'password', label: 'Password', secret: true },
          { key: 'from', label: 'From address' },
          { key: 'to', label: 'To address' },
        ],
      },
    ],
  },
]

export default function NewConnectionPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<AdapterMeta | null>(null)
  const [name, setName] = useState('')
  const [creds, setCreds] = useState<Record<string, string>>({})

  const createMut = trpc.connections.create.useMutation({
    onSuccess: () => router.push('/connections'),
  })

  function handleSelect(adapter: AdapterMeta) {
    setSelected(adapter)
    setName(adapter.label)
    setCreds({})
  }

  function handleSubmit() {
    if (!selected || !name.trim()) return
    createMut.mutate({
      type: selected.type,
      name: name.trim(),
      credentials: creds,
    })
  }

  if (selected) {
    return (
      <>
        <Topbar title={`New ${selected.label} connection`} />
        <PageContent>
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <Card>
              <div style={{ display: 'grid', gap: 14 }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Connection name
                  </span>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder={selected.label} />
                </label>

                {selected.credFields.map(f => (
                  <label key={f.key} style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {f.label}
                    </span>
                    <Input
                      type={f.secret ? 'password' : 'text'}
                      value={creds[f.key] ?? ''}
                      onChange={e => setCreds(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.secret ? '••••••••' : ''}
                    />
                  </label>
                ))}

                {createMut.isError && (
                  <div style={{ fontSize: 11, color: 'var(--red)' }}>
                    {createMut.error.message}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                  <Button variant="ghost" onClick={() => setSelected(null)}>Back</Button>
                  <Button variant="primary" onClick={handleSubmit} disabled={createMut.isPending || !name.trim()}>
                    {createMut.isPending ? 'Saving…' : 'Save connection'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </PageContent>
      </>
    )
  }

  return (
    <>
      <Topbar title="Add connection" />
      <PageContent>
        {ADAPTERS.map(group => (
          <div key={group.category} style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: 'var(--text-dim)',
              marginBottom: 8,
            }}>
              {group.category}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, alignItems: 'stretch' }}>
              {group.items.map(adapter => (
                <div key={adapter.type} onClick={() => handleSelect(adapter)} style={{ cursor: 'pointer', display: 'flex' }}>
                  <Card style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{adapter.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                      {adapter.description}
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        ))}
      </PageContent>
    </>
  )
}
