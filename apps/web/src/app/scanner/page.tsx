'use client'

import { useState, useRef, type ChangeEvent } from 'react'
import { Badge, Button, Card, Dot, Select, Toggle } from '~/components/ui'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { parseComposeFile } from '@proxyos/scanner'

export default function ScannerPage() {
  const utils = trpc.useUtils()
  const agentList = trpc.agents.list.useQuery()
  const scanMut   = trpc.scanner.scan.useMutation({
    onSuccess: () => utils.scanner.getResults.invalidate(),
  })
  const exposeMut = trpc.scanner.exposeContainer.useMutation({
    onSuccess: () => utils.scanner.getResults.invalidate(),
  })
  const dismissMut = trpc.scanner.dismissContainer.useMutation({
    onSuccess: () => utils.scanner.getResults.invalidate(),
  })

  const [agentId, setAgentId]     = useState('')
  const [autoOpen, setAutoOpen]   = useState(false)
  const [composeRoutes, setComposeRoutes] = useState<ReturnType<typeof parseComposeFile> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const autoWatch = trpc.scanner.getAutoWatch.useQuery({ agentId: agentId || undefined })
  const setAutoWatchMut = trpc.scanner.setAutoWatch.useMutation({
    onSuccess: () => autoWatch.refetch(),
  })
  const results = trpc.scanner.getResults.useQuery({ agentId: agentId || undefined })
  const containers = results.data?.results ?? []
  const withRoutes  = containers.filter(c => c.detectedRoutes.length > 0)
  const newCount    = withRoutes.filter(c => c.detectedRoutes.some(r => !r.alreadyConfigured)).length

  function onComposeFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = parseComposeFile(ev.target?.result as string ?? '')
        setComposeRoutes(parsed)
      } catch {
        setComposeRoutes([])
      }
    }
    reader.readAsText(file)
  }

  return (
    <>
      <Topbar title="Docker Scanner" actions={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select value={agentId} onChange={e => setAgentId(e.target.value)} style={{ minWidth: 140 }}>
            <option value="">Local host</option>
            {agentList.data?.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Button variant="primary"
            onClick={() => scanMut.mutate({ agentId: agentId || undefined })}
            disabled={scanMut.isPending}>
            {scanMut.isPending ? 'Scanning…' : 'Scan Now'}
          </Button>
        </div>
      } />
      <PageContent>
        <PageHeader title="Scanner" desc="Auto-detect Docker containers ready to be exposed as routes." />
        {/* Status bar */}
        {results.data && (
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 28, fontSize: 12 }}>
              <span><span style={{ color: 'var(--text-dim)' }}>Last scan:</span> <strong>{results.data.scannedAt.toLocaleTimeString()}</strong></span>
              <span><strong>{containers.length}</strong> <span style={{ color: 'var(--text-dim)' }}>containers</span></span>
              <span><strong style={{ color: 'var(--accent)' }}>{newCount}</strong> <span style={{ color: 'var(--text-dim)' }}>new suggestions</span></span>
              <span><strong style={{ color: 'var(--green)' }}>{containers.filter(c => c.detectedRoutes.some(r => r.alreadyConfigured)).length}</strong> <span style={{ color: 'var(--text-dim)' }}>already configured</span></span>
            </div>
          </Card>
        )}

        {scanMut.isError && (
          <div style={{ padding: '10px 14px', borderRadius: 6, background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>
            Scan failed: {scanMut.error.message}
          </div>
        )}

        {containers.length === 0 && !scanMut.isPending && (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)', fontSize: 12 }}>
              No scan results yet. Click "Scan Now" to discover services.
            </div>
          </Card>
        )}

        {/* Container cards */}
        {withRoutes.map(container => (
          <Card key={container.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{container.name}</span>
                <span style={{ marginLeft: 8, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{container.image}</span>
              </div>
              <Badge tone={container.status === 'running' ? 'green' : 'neutral'}>{container.status}</Badge>
            </div>

            {container.detectedRoutes.map((route, i) => (
              <div key={i} style={{
                marginTop: 10, padding: '10px 12px', borderRadius: 6,
                background: 'var(--surface-2)',
                border: route.alreadyConfigured
                  ? '1px solid var(--border)'
                  : `1px solid color-mix(in srgb, var(--accent) ${route.confidence === 'high' ? 30 : 15}%, transparent)`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Dot tone={route.alreadyConfigured ? 'green' : route.confidence === 'high' ? 'green' : 'amber'} />
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{route.suggestedDomain || '(no domain)'}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>→ {route.suggestedUpstream}</span>
                    <Badge tone={route.confidence === 'high' ? 'green' : route.confidence === 'medium' ? 'amber' : 'neutral'}>
                      {route.strategy.replace(/_/g, ' ')} · {route.confidence}
                    </Badge>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {route.alreadyConfigured
                      ? <Badge tone="neutral">Already configured</Badge>
                      : <>
                          {route.confidence === 'high' && (
                            <Button variant="primary" style={{ fontSize: 11, padding: '4px 10px' }}
                              onClick={() => exposeMut.mutate({ containerId: container.id, agentId: agentId || undefined })}
                              disabled={exposeMut.isPending}>
                              One-click Expose
                            </Button>
                          )}
                          {route.confidence !== 'high' && (
                            <Button variant="ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
                              Review & Expose
                            </Button>
                          )}
                          <Button variant="ghost" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--text-dim)' }}
                            onClick={() => dismissMut.mutate({ containerId: container.id })}>
                            Dismiss
                          </Button>
                        </>
                    }
                  </div>
                </div>
                {route.warnings.length > 0 && (
                  <div style={{ marginTop: 5, fontSize: 10, color: 'var(--amber)' }}>
                    ⚠ {route.warnings.join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </Card>
        ))}

        {/* Compose file parser */}
        <Card header={<span>Parse docker-compose.yml</span>} style={{ marginTop: 8 }}>
          <div
            onClick={() => fileRef.current?.click()}
            style={{ padding: 20, border: '1px dashed var(--border)', borderRadius: 6, textAlign: 'center', cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)' }}>
            {composeRoutes
              ? `✓ ${composeRoutes.length} route suggestions from compose file`
              : 'Click to upload docker-compose.yml'}
          </div>
          <input ref={fileRef} type="file" style={{ display: 'none' }} accept=".yml,.yaml" onChange={onComposeFile} />
          {composeRoutes && composeRoutes.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {composeRoutes.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                  <span>{r.domain} → {r.upstream}</span>
                  <Badge tone={r.confidence === 'high' ? 'green' : r.confidence === 'medium' ? 'amber' : 'neutral'}>{r.confidence}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Auto-watch settings */}
        <Card style={{ marginTop: 8 }}>
          <button
            onClick={() => setAutoOpen(v => !v)}
            style={{ width: '100%', background: 'none', border: 0, color: 'var(--text-primary)', fontSize: 12, fontWeight: 500, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', padding: 0 }}>
            <span>Auto-watch settings</span>
            <span style={{ color: 'var(--text-dim)' }}>{autoOpen ? '▾' : '▸'}</span>
          </button>
          {autoOpen && (
            <div style={{ marginTop: 12, display: 'grid', gap: 10, fontSize: 11 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Enable auto-watch</span>
                <Toggle
                  checked={autoWatch.data?.enabled ?? false}
                  onChange={v => setAutoWatchMut.mutate({ agentId: agentId || undefined, enabled: v, mode: autoWatch.data?.mode ?? 'notify' })}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mode</span>
                <Select
                  value={autoWatch.data?.mode ?? 'notify'}
                  onChange={e => setAutoWatchMut.mutate({ agentId: agentId || undefined, enabled: autoWatch.data?.enabled ?? false, mode: e.target.value as 'notify' | 'auto_labels' | 'auto_all' })}
                >
                  <option value="notify">Notify only</option>
                  <option value="auto_labels">Auto-expose (labels only)</option>
                  <option value="auto_all">Auto-expose (all high-confidence)</option>
                </Select>
              </label>
            </div>
          )}
        </Card>
      </PageContent>
    </>
  )
}
