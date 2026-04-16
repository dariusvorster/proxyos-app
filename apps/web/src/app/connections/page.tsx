'use client'

import Link from 'next/link'
import { Badge, Button, Card, Dot, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

const TYPE_LABELS: Record<string, string> = {
  cloudflare:   'Cloudflare',
  authentik:    'Authentik',
  authelia:     'Authelia',
  keycloak:     'Keycloak',
  zitadel:      'Zitadel',
  hetzner_dns:  'Hetzner DNS',
  route53:      'Route 53',
  namecheap:    'Namecheap',
  tailscale:    'Tailscale Funnel',
  wireguard:    'WireGuard',
  uptime_kuma:  'Uptime Kuma',
  betterstack:  'Betterstack',
  freshping:    'Freshping',
  zulip:        'Zulip',
  slack:        'Slack',
  webhook:      'Webhook',
  smtp:         'SMTP',
}

const TYPE_CATEGORY: Record<string, string> = {
  cloudflare:   'CDN / Cloud',
  authentik:    'Identity',
  authelia:     'Identity',
  keycloak:     'Identity',
  zitadel:      'Identity',
  hetzner_dns:  'DNS',
  route53:      'DNS',
  namecheap:    'DNS',
  tailscale:    'Tunnel',
  wireguard:    'Tunnel',
  uptime_kuma:  'Monitoring',
  betterstack:  'Monitoring',
  freshping:    'Monitoring',
  zulip:        'Notifications',
  slack:        'Notifications',
  webhook:      'Notifications',
  smtp:         'Notifications',
}

export default function ConnectionsPage() {
  const list = trpc.connections.list.useQuery()
  const testMut = trpc.connections.test.useMutation({
    onSuccess: () => list.refetch(),
  })
  const deleteMut = trpc.connections.delete.useMutation({
    onSuccess: () => list.refetch(),
  })

  const connections = list.data ?? []

  return (
    <>
      <Topbar title="Connections" actions={
        <Link href="/connections/new">
          <Button variant="primary">+ Add Connection</Button>
        </Link>
      } />
      <PageContent>
        <Card header={<span>External service connections</span>}>
          {list.isLoading && (
            <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div>
          )}
          {!list.isLoading && connections.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
              No connections yet.{' '}
              <Link href="/connections/new" style={{ color: 'var(--accent)' }}>
                Add your first connection →
              </Link>
            </div>
          )}
          {connections.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Name', 'Type', 'Category', 'Status', 'Last sync', ''].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {connections.map(conn => (
                  <tr key={conn.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td}><span style={{ fontWeight: 500 }}>{conn.name}</span></td>
                    <td style={td}>
                      <Badge tone="neutral">{TYPE_LABELS[conn.type] ?? conn.type}</Badge>
                    </td>
                    <td style={td} >
                      <span style={{ color: 'var(--text-dim)' }}>
                        {TYPE_CATEGORY[conn.type] ?? '—'}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Dot tone={
                          conn.status === 'connected' ? 'green' :
                          conn.status === 'error' ? 'red' : 'neutral'
                        } />
                        {conn.status}
                      </span>
                    </td>
                    <td style={td}>
                      {conn.lastSync
                        ? new Date(conn.lastSync).toLocaleString()
                        : <span style={{ color: 'var(--text-ghost)' }}>never</span>}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button variant="ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => testMut.mutate({ id: conn.id })}
                          disabled={testMut.isPending}>
                          Test
                        </Button>
                        <Button variant="ghost" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--red)' }}
                          onClick={() => {
                            if (confirm(`Delete connection "${conn.name}"?`)) {
                              deleteMut.mutate({ id: conn.id })
                            }
                          }}
                          disabled={deleteMut.isPending}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {connections.some(c => c.lastError) && (
          <Card style={{ marginTop: 12 }} header={<span>Recent errors</span>}>
            <div style={{ display: 'grid', gap: 8 }}>
              {connections.filter(c => c.lastError).map(conn => (
                <div key={conn.id} style={{
                  padding: '8px 12px', borderRadius: 6,
                  background: 'color-mix(in srgb, var(--red) 8%, transparent)',
                  fontSize: 11,
                }}>
                  <span style={{ fontWeight: 500 }}>{conn.name}</span>
                  <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>{conn.lastError}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </PageContent>
    </>
  )
}
