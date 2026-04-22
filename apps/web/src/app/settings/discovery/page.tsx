'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card, DataTable, td, th } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

export default function DiscoveryPage() {
  const [handleError] = useErrorHandler()
  const providers = trpc.discovery.listProviders.useQuery()
  const discovered = trpc.discovery.listDiscovered.useQuery({})
  const createMut = trpc.discovery.createProvider.useMutation({ onSuccess: () => { providers.refetch(); setForm(false) }, onError: handleError })
  const deleteMut = trpc.discovery.deleteProvider.useMutation({ onSuccess: () => providers.refetch(), onError: handleError })
  const promoteMut = trpc.discovery.promote.useMutation({ onSuccess: () => discovered.refetch(), onError: handleError })
  const unlinkMut = trpc.discovery.unlink.useMutation({ onSuccess: () => discovered.refetch(), onError: handleError })

  const [showForm, setForm] = useState(false)
  const [type, setType] = useState<'docker' | 'proxmox' | 'infraos'>('docker')
  const [name, setName] = useState('')
  const [socketPath, setSocketPath] = useState('/var/run/docker.sock')
  const [apiUrl, setApiUrl] = useState('')
  const [apiToken, setApiToken] = useState('')

  return (
    <>
      <Topbar
        title="Discovery"
        actions={<Button variant="primary" onClick={() => setForm(true)}>+ Add provider</Button>}
      />
      <PageContent>
        <PageHeader title="Service discovery" desc="Auto-discover routes from Docker containers, Proxmox VMs, and InfraOS." />

        {showForm && (
          <Card header={<span>New discovery provider</span>}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Provider type</div>
                  <select value={type} onChange={e => setType(e.target.value as typeof type)}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
                    <option value="docker">Docker</option>
                    <option value="proxmox">Proxmox</option>
                    <option value="infraos">InfraOS</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Name</div>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="My Docker host"
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                </div>
                {type === 'docker' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Socket path</div>
                    <input value={socketPath} onChange={e => setSocketPath(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                      Add label <code style={{ background: 'var(--surface2)', padding: '1px 4px' }}>proxyos.enable=true</code> + <code style={{ background: 'var(--surface2)', padding: '1px 4px' }}>proxyos.host=app.example.com</code> + <code style={{ background: 'var(--surface2)', padding: '1px 4px' }}>proxyos.port=3000</code> to containers.
                    </div>
                  </div>
                )}
                {(type === 'proxmox' || type === 'infraos') && (
                  <>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>API URL</div>
                      <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://pve.host:8006"
                        style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>API token</div>
                      <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary"
                  onClick={() => createMut.mutate({ type, name, config: { socketPath: type === 'docker' ? socketPath : undefined, apiUrl: type !== 'docker' ? apiUrl : undefined, apiToken: type !== 'docker' ? apiToken : undefined } })}
                  disabled={!name || createMut.isPending}>
                  {createMut.isPending ? 'Adding…' : 'Add provider'}
                </Button>
                <Button variant="ghost" onClick={() => setForm(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        <Card header={<span>Providers</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '30%' }}>Name</th>
                <th style={{ ...th, width: '15%' }}>Type</th>
                <th style={{ ...th, width: '20%' }}>Last sync</th>
                <th style={{ ...th, width: '15%' }}>Status</th>
                <th style={{ ...th, width: '20%' }}></th>
              </tr>
            </thead>
            <tbody>
              {providers.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No providers configured.</td></tr>
              )}
              {providers.data?.map(p => (
                <tr key={p.id}>
                  <td style={{ ...td, fontWeight: 500 }}>{p.name}</td>
                  <td style={td}><Badge tone="neutral">{p.type}</Badge></td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text2)' }}>{p.lastSyncAt ? new Date(p.lastSyncAt).toLocaleString() : 'Never'}</td>
                  <td style={td}><Badge tone={p.enabled ? 'green' : 'neutral'}>{p.enabled ? 'enabled' : 'disabled'}</Badge></td>
                  <td style={td}>
                    <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)' }}
                      onClick={() => { if (confirm('Delete provider?')) deleteMut.mutate({ id: p.id }) }}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card header={<span>Discovered routes ({discovered.data?.length ?? 0})</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '30%' }}>Domain</th>
                <th style={{ ...th, width: '25%' }}>Upstream</th>
                <th style={{ ...th, width: '20%' }}>Last seen</th>
                <th style={{ ...th, width: '25%' }}></th>
              </tr>
            </thead>
            <tbody>
              {discovered.data?.length === 0 && (
                <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No routes discovered yet.</td></tr>
              )}
              {discovered.data?.map(d => (
                <tr key={d.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{d.domain}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)' }}>{d.upstreamUrl}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text2)' }}>{new Date(d.lastSeenAt).toLocaleString()}</td>
                  <td style={td}>
                    {d.promotedRouteId ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Badge tone="green">promoted</Badge>
                        <Link href={`/routes/${d.promotedRouteId}`} style={{ fontSize: 11, color: 'var(--pu-400)' }}>View →</Link>
                        <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => unlinkMut.mutate({ discoveredId: d.id })}>Unlink</Button>
                      </div>
                    ) : (
                      <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--green)' }}
                        onClick={() => promoteMut.mutate({ discoveredId: d.id })}
                        disabled={promoteMut.isPending}>
                        Promote to route
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>
    </>
  )
}
