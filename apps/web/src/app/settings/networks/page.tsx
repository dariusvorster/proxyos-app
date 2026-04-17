'use client'

import { useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card, Toggle } from '~/components/ui'
import { trpc } from '~/lib/trpc'

function statusTone(status: string): 'green' | 'amber' | 'red' | 'neutral' {
  if (status === 'joined') return 'green'
  if (status === 'available') return 'amber'
  if (status === 'excluded') return 'neutral'
  return 'red'
}

function statusLabel(status: string) {
  if (status === 'joined') return 'Joined'
  if (status === 'available') return 'Available'
  if (status === 'excluded') return 'Excluded'
  return 'Unreachable'
}

export default function NetworksPage() {
  const socketStatus = trpc.networks.socketStatus.useQuery()
  const networks = trpc.networks.list.useQuery()
  const settings = trpc.networks.getSettings.useQuery()
  const updateSettings = trpc.networks.updateSettings.useMutation({ onSuccess: () => settings.refetch() })
  const excludeMut = trpc.networks.exclude.useMutation({ onSuccess: () => networks.refetch() })
  const includeMut = trpc.networks.include.useMutation({ onSuccess: () => networks.refetch() })
  const rescanMut = trpc.networks.rescanNow.useMutation({ onSuccess: () => networks.refetch() })

  const [scanning, setScanning] = useState(false)

  async function handleRescan() {
    setScanning(true)
    try { await rescanMut.mutateAsync() } finally { setScanning(false) }
  }

  const socketAvailable = socketStatus.data?.available ?? false

  return (
    <>
      <Topbar
        title="Docker Networks"
        actions={
          <Button
            variant="ghost"
            onClick={handleRescan}
            disabled={scanning || !socketAvailable}
          >
            {scanning ? 'Scanning…' : 'Rescan now'}
          </Button>
        }
      />
      <PageContent>
        <PageHeader
          title="Docker network discovery"
          desc="ProxyOS automatically joins Docker networks containing running containers so upstreams are reachable by container name."
        />

        {socketStatus.data && !socketAvailable && (
          <div style={{
            background: 'var(--surface2)',
            border: '1px solid var(--yellow)',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 12,
            color: 'var(--text)',
            marginBottom: 4,
          }}>
            <strong style={{ color: 'var(--yellow)' }}>Auto-discovery disabled</strong> — Docker socket not mounted.
            Add <code style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: 3 }}>/var/run/docker.sock:/var/run/docker.sock</code> to
            your compose <code style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: 3 }}>volumes:</code> to enable container-by-name routing.
          </div>
        )}

        <Card header={<span>Settings</span>}>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>Auto-join networks</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  Automatically connect to Docker networks containing running containers
                </div>
              </div>
              <Toggle
                checked={settings.data?.enabled ?? true}
                onChange={v => updateSettings.mutate({ enabled: v })}
                disabled={!socketAvailable}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>Leave empty networks</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  Disconnect from networks when they no longer have running containers
                </div>
              </div>
              <Toggle
                checked={settings.data?.leaveEmptyNetworks ?? false}
                onChange={v => updateSettings.mutate({ leaveEmptyNetworks: v })}
                disabled={!socketAvailable}
              />
            </div>
          </div>
        </Card>

        <Card header={<span>Discovered networks</span>}>
          {networks.isLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Loading…</div>
          ) : !networks.data?.length ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              {socketAvailable ? 'No Docker networks found. Start some containers to see networks here.' : 'Mount the Docker socket to see networks.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Network', 'Driver', 'Containers', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {networks.data.map(net => (
                  <tr key={net.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                      {net.name}
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{net.id.slice(0, 12)}</div>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{net.driver}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{net.containerCount}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <Badge tone={statusTone(net.status)}>{statusLabel(net.status)}</Badge>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {net.status !== 'excluded' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => excludeMut.mutate({ networkName: net.name })}
                          disabled={excludeMut.isPending}
                        >
                          Exclude
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => includeMut.mutate({ networkName: net.name })}
                          disabled={includeMut.isPending}
                        >
                          Include
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </PageContent>
    </>
  )
}
