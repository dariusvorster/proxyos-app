'use client'

import { use } from 'react'
import { Badge, Button, Card, Dot } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function AgentScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const utils = trpc.useUtils()
  const results = trpc.scanner.getResults.useQuery({ agentId: id })
  const scanMut = trpc.scanner.scan.useMutation({
    onSuccess: () => utils.scanner.getResults.invalidate(),
  })
  const exposeMut = trpc.scanner.exposeContainer.useMutation({
    onSuccess: () => utils.scanner.getResults.invalidate(),
  })

  const containers = results.data?.results ?? []
  const withRoutes = containers.filter(c => c.detectedRoutes.length > 0)
  const newSuggestions = withRoutes.filter(c => c.detectedRoutes.some(r => !r.alreadyConfigured)).length

  return (
    <>
      <Topbar title="Docker Scanner" actions={
        <Button variant="primary"
          onClick={() => scanMut.mutate({ agentId: id })}
          disabled={scanMut.isPending}>
          {scanMut.isPending ? 'Scanning…' : 'Scan Now'}
        </Button>
      } />
      <PageContent>
        {results.data && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>
            Last scan: {results.data.scannedAt.toLocaleString()} · {containers.length} containers · {newSuggestions} new suggestions
          </div>
        )}

        {scanMut.isError && (
          <div style={{ padding: '10px 14px', borderRadius: 6, background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)', fontSize: 12, marginBottom: 16 }}>
            Scan failed: {scanMut.error.message}
          </div>
        )}

        {containers.length === 0 && !scanMut.isPending && (
          <Card>
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)', fontSize: 12 }}>
              No scan results yet. Click "Scan Now" to detect containers on this agent's Docker host.
            </div>
          </Card>
        )}

        {withRoutes.map(container => (
          <Card key={container.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{container.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{container.image}</div>
              </div>
              <Badge tone={container.status === 'running' ? 'green' : 'neutral'}>{container.status}</Badge>
            </div>

            {container.detectedRoutes.map((route, i) => (
              <div key={i} style={{
                marginTop: 12, padding: '10px 12px',
                background: 'var(--surface-2)', borderRadius: 6,
                border: route.alreadyConfigured ? '1px solid var(--border)' : '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {route.suggestedDomain || '(no domain)'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>
                      → {route.suggestedUpstream}
                    </span>
                    <span style={{ marginLeft: 8 }}>
                      <Badge tone={route.confidence === 'high' ? 'green' : route.confidence === 'medium' ? 'amber' : 'neutral'}>
                        {route.strategy.replace('_', ' ')} · {route.confidence}
                      </Badge>
                    </span>
                  </div>
                  {route.alreadyConfigured
                    ? <Badge tone="neutral">Already configured</Badge>
                    : route.confidence === 'high'
                      ? <Button variant="primary" style={{ fontSize: 11, padding: '4px 10px' }}
                          onClick={() => exposeMut.mutate({ containerId: container.id, agentId: id })}
                          disabled={exposeMut.isPending}>
                          One-click Expose
                        </Button>
                      : <Button variant="ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
                          Review & Expose
                        </Button>
                  }
                </div>
                {route.warnings.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--amber)' }}>
                    ⚠ {route.warnings.join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </Card>
        ))}

        {containers.filter(c => c.skipped).length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 8 }}>
            {containers.filter(c => c.skipped).length} containers skipped (no HTTP ports or proxy labels)
          </div>
        )}
      </PageContent>
    </>
  )
}
