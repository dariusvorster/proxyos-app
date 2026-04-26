'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Badge, Button, Card, Dot, td, th } from '~/components/ui'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function ZonesPage() {
  const { id } = useParams<{ id: string }>()
  const utils = trpc.useUtils()

  const zones = trpc.connections.cloudflare.listZones.useQuery({ id }, { enabled: !!id })
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)

  const records = trpc.connections.cloudflare.listRecords.useQuery(
    { id, zoneId: selectedZoneId ?? '' },
    { enabled: !!selectedZoneId },
  )

  const setProxied = trpc.connections.cloudflare.setProxied.useMutation({
    onSuccess: () => records.refetch(),
  })

  const selectedZone = zones.data?.find(z => z.id === selectedZoneId)

  return (
    <>
      <Topbar
        title="Cloudflare zones"
        actions={<Link href="/connections" style={{ fontSize: 11, color: 'var(--pu-400)' }}>← Connections</Link>}
      />
      <PageContent>
        <PageHeader
          title="DNS zones"
          desc="DNS records managed by ProxyOS for this Cloudflare connection."
        />

        {zones.isLoading && (
          <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 12 }}>Loading zones…</div>
        )}

        {zones.error && (
          <Card>
            <div style={{ color: 'var(--red)', fontSize: 12 }}>{zones.error.message}</div>
          </Card>
        )}

        {zones.data && zones.data.length === 0 && (
          <Card>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              No zones found. Check that your API token has Zone:Read permission.
            </div>
          </Card>
        )}

        {zones.data && zones.data.length > 0 && (
          <Card header={<span>Zones ({zones.data.length})</span>} style={{ marginBottom: 12 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              {zones.data.map(zone => (
                <button
                  key={zone.id}
                  onClick={() => setSelectedZoneId(zone.id === selectedZoneId ? null : zone.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                    background: zone.id === selectedZoneId ? 'rgba(124,111,240,0.12)' : 'var(--surface-2)',
                    border: zone.id === selectedZoneId ? '1px solid var(--pu-400)' : '0.5px solid var(--border)',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{zone.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                      {zone.name_servers.slice(0, 2).join(', ')}
                    </div>
                  </div>
                  <Badge tone={zone.status === 'active' ? 'green' : 'neutral'}>{zone.status}</Badge>
                </button>
              ))}
            </div>
          </Card>
        )}

        {selectedZone && (
          <Card header={<span>DNS records — {selectedZone.name}</span>}>
            {records.isLoading && (
              <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12 }}>Loading records…</div>
            )}
            {records.error && (
              <div style={{ color: 'var(--red)', fontSize: 12, padding: 8 }}>{records.error.message}</div>
            )}
            {records.data && records.data.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 8 }}>No DNS records found.</div>
            )}
            {records.data && records.data.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Type', 'Name', 'Content', 'TTL', 'Proxy', ''].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.data.map(record => (
                    <tr key={record.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={td}><Badge tone="neutral">{record.type}</Badge></td>
                      <td style={td}>
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{record.name}</code>
                      </td>
                      <td style={td}>
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                          {record.content}
                        </code>
                      </td>
                      <td style={td}>
                        <span style={{ color: 'var(--text-dim)' }}>{record.ttl === 1 ? 'Auto' : `${record.ttl}s`}</span>
                      </td>
                      <td style={td}>
                        <ProxyToggle
                          proxied={record.proxied}
                          loading={setProxied.isPending && setProxied.variables?.recordId === record.id}
                          onToggle={() => setProxied.mutate({
                            id,
                            zoneId: selectedZoneId!,
                            recordId: record.id,
                            proxied: !record.proxied,
                          })}
                        />
                      </td>
                      <td style={td}>
                        <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>{record.id.slice(0, 8)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </PageContent>
    </>
  )
}

function ProxyToggle({ proxied, loading, onToggle }: { proxied: boolean; loading: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      title={proxied ? 'Proxied (click to set DNS-only)' : 'DNS-only (click to enable proxy)'}
      style={{
        background: 'none', border: 'none', cursor: loading ? 'wait' : 'pointer',
        fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4,
        opacity: loading ? 0.5 : 1,
      }}
    >
      {proxied ? '🟠' : '⚪'}
    </button>
  )
}
