'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card } from '~/components/ui'
import { trpc } from '~/lib/trpc'

export default function ContainersPage() {
  const { data, isLoading, refetch, isFetching } = trpc.containers.listDiscoverable.useQuery(
    undefined,
    { refetchInterval: 15000 },
  )
  const [filter, setFilter] = useState('')

  const filtered = (data?.containers ?? []).filter((c) => {
    if (!filter) return true
    const f = filter.toLowerCase()
    return (
      c.name.toLowerCase().includes(f) ||
      c.image.toLowerCase().includes(f) ||
      c.sharedNetworks.some((n) => n.toLowerCase().includes(f))
    )
  })

  return (
    <>
      <Topbar
        title="Containers"
        actions={
          <Button variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />
      <PageContent>
        <PageHeader
          title="Discoverable containers"
          desc="Containers on networks ProxyOS has joined. Click a port to create a route."
        />

        {data && !data.socketMounted && (
          <div style={{
            background: 'var(--surface2)',
            border: '1px solid var(--yellow)',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 12,
            color: 'var(--text)',
            marginBottom: 4,
          }}>
            <strong style={{ color: 'var(--yellow)' }}>Docker socket not available</strong>
            {data.error && <div style={{ marginTop: 4, color: 'var(--text2)' }}>{data.error}</div>}
          </div>
        )}

        {data?.socketMounted && data.error && (
          <div style={{
            background: 'var(--surface2)',
            border: '1px solid var(--red)',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 12,
            color: 'var(--red)',
            marginBottom: 4,
          }}>
            {data.error}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Filter by name, image, or network…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
            }}
          />
        </div>

        {isLoading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
            Loading containers…
          </div>
        )}

        {!isLoading && data?.socketMounted && filtered.length === 0 && (
          <Card>
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              {(data.containers.length === 0)
                ? 'No discoverable containers. Check that ProxyOS has joined networks with running containers on the Networks page.'
                : 'No containers match your filter.'}
            </div>
          </Card>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((c) => (
            <Card key={c.id}>
              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {c.name}
                  </span>
                  <Badge tone={c.state === 'running' ? 'green' : 'neutral'}>{c.state}</Badge>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{c.image}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>
                  Networks: {c.sharedNetworks.join(', ')}
                </div>
                {c.ips.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: c.ports.length > 0 ? 10 : 0, fontFamily: 'var(--font-mono)' }}>
                    {c.ips.join(', ')}
                  </div>
                )}

                {c.ports.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {c.ports.map((p) => (
                      <Link
                        key={`${p.internalPort}-${p.protocol}`}
                        href={`/routes?upstream=${encodeURIComponent(p.suggestedUpstream)}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          background: 'var(--surface2)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text)',
                          textDecoration: 'none',
                        }}
                      >
                        {p.suggestedUpstream}
                        <span style={{ color: 'var(--text3)', fontSize: 10 }}>
                          {p.protocol.toUpperCase()}
                          {p.exposedOnHost && p.hostPort ? ` · :${p.hostPort}` : ''}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>No exposed ports declared</div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {data?.socketMounted && filtered.length > 0 && (
          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>
            {filtered.length} of {data.containers.length} containers · auto-refreshes every 15s
          </div>
        )}
      </PageContent>
    </>
  )
}
