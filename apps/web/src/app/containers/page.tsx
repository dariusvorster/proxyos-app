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

        <div style={{
          background: 'color-mix(in srgb, var(--blue) 10%, var(--surface2))',
          border: '1px solid color-mix(in srgb, var(--blue) 40%, var(--border))',
          borderRadius: 6,
          padding: '10px 14px',
          fontSize: 12,
          color: 'var(--text)',
          marginBottom: 4,
        }}>
          <strong>Exposing these services to the internet?</strong>{' '}
          Every Cloudflare Tunnel hostname should point to{' '}
          <code style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: 3 }}>proxyos:80</code>.
          {' '}ProxyOS handles the internal routing. See the{' '}
          <Link href="/docs/setup-guide" style={{ color: 'var(--blue)', textDecoration: 'underline' }}>Setup Guide</Link>{' '}
          for the full flow.
        </div>

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
              {data.containers.length === 0
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
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{c.image}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: c.ports.length > 0 ? 10 : 0 }}>
                  {c.networksWithIps.map((n) => (
                    <div key={n.network} style={{ marginBottom: 1 }}>
                      <span style={{ color: 'var(--text3)' }}>Network: </span>
                      <code style={{ fontFamily: 'var(--font-mono)' }}>{n.network}</code>
                      <span style={{ color: 'var(--text3)' }}> → IP: </span>
                      <code style={{ fontFamily: 'var(--font-mono)' }}>{n.ipAddress}</code>
                    </div>
                  ))}
                </div>

                {c.ports.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {c.ports.map((p) => (
                      <div
                        key={`${p.internalPort}-${p.protocol}`}
                        style={{
                          background: 'var(--surface2)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          padding: '6px 10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
                              {p.suggestedUpstream}
                            </code>
                            <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                              {p.protocol.toUpperCase()}
                              {p.exposedOnHost && p.hostPort ? ` · :${p.hostPort}` : ''}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(p.suggestedUpstream)}>
                              Copy
                            </Button>
                            <Link
                              href={`/routes?upstream=${encodeURIComponent(p.suggestedUpstream)}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '3px 8px',
                                background: 'var(--blue)',
                                color: '#fff',
                                borderRadius: 4,
                                fontSize: 11,
                                textDecoration: 'none',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Create Route
                            </Link>
                          </div>
                        </div>
                        <details style={{ marginTop: 6 }}>
                          <summary style={{ fontSize: 11, color: 'var(--text2)', cursor: 'pointer' }}>
                            Cloudflare Tunnel settings
                          </summary>
                          <div style={{
                            marginTop: 6,
                            paddingLeft: 10,
                            borderLeft: '2px solid var(--border)',
                            fontSize: 11,
                            color: 'var(--text2)',
                          }}>
                            <div style={{ marginBottom: 4 }}>
                              Zero Trust → Networks → Tunnels → (your tunnel) → Public Hostname → Add:
                            </div>
                            <div style={{
                              background: 'var(--surface3)',
                              borderRadius: 4,
                              padding: '6px 10px',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                            }}>
                              <div><span style={{ color: 'var(--text3)' }}>Subdomain:</span> {c.name.split(/[-_]/)[0]}</div>
                              <div><span style={{ color: 'var(--text3)' }}>Domain:</span> your domain</div>
                              <div><span style={{ color: 'var(--text3)' }}>Path:</span> <em style={{ color: 'var(--text3)' }}>(leave empty)</em></div>
                              <div><span style={{ color: 'var(--text3)' }}>Service Type:</span> HTTP</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: 'var(--text3)' }}>Service URL:</span>
                                <code>proxyos:80</code>
                                <button
                                  onClick={() => navigator.clipboard.writeText('proxyos:80')}
                                  style={{ fontSize: 10, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                >
                                  [copy]
                                </button>
                              </div>
                            </div>
                            <div style={{ marginTop: 4, color: 'var(--text3)', fontStyle: 'italic' }}>
                              Always point the tunnel at <code>proxyos:80</code> — not at the service directly.
                              ProxyOS uses the Host header to route internally.
                            </div>
                          </div>
                        </details>
                      </div>
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
