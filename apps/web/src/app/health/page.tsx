'use client'

import { useState } from 'react'
import { Badge, Button, Card, Dot } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

interface UpstreamResult {
  address: string
  ok: boolean
  status?: number
  latencyMs: number
  error?: string
}

interface RouteHealth {
  pending: boolean
  results: UpstreamResult[]
  testedAt: Date | null
  error: string | null
}

export default function HealthPage() {
  const [handleError] = useErrorHandler()
  const routes = trpc.routes.list.useQuery()
  const testRoute = trpc.routes.test.useMutation({ onError: handleError })
  const [health, setHealth] = useState<Record<string, RouteHealth>>({})
  const [testingAll, setTestingAll] = useState(false)

  async function runTest(routeId: string) {
    setHealth(prev => ({ ...prev, [routeId]: { pending: true, results: [], testedAt: null, error: null } }))
    try {
      const res = await testRoute.mutateAsync({ id: routeId })
      setHealth(prev => ({ ...prev, [routeId]: { pending: false, results: res.results, testedAt: new Date(), error: null } }))
    } catch (err) {
      setHealth(prev => ({ ...prev, [routeId]: { pending: false, results: [], testedAt: new Date(), error: (err as Error).message } }))
    }
  }

  async function testAll() {
    if (!routes.data) return
    setTestingAll(true)
    await Promise.all(routes.data.map(r => runTest(r.id)))
    setTestingAll(false)
  }

  const routeList = routes.data ?? []
  const testedCount = Object.values(health).filter(h => !h.pending && h.testedAt).length
  const downCount = Object.values(health).filter(h => h.results.some(r => !r.ok)).length
  const upCount = Object.values(health).filter(h => h.testedAt && !h.error && h.results.every(r => r.ok)).length

  return (
    <>
      <Topbar
        title="Upstream health"
        actions={
          <Button variant="primary" onClick={testAll} disabled={testingAll || routeList.length === 0} style={{ fontSize: 11 }}>
            {testingAll ? 'Testing…' : 'Test all'}
          </Button>
        }
      />
      <PageContent>
        {testedCount > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
            <Pill label="Tested" value={testedCount} color="var(--text-dim)" />
            <Pill label="All up" value={upCount} color="var(--green)" />
            <Pill label="Issues" value={downCount} color={downCount > 0 ? 'var(--red)' : 'var(--text-dim)'} />
          </div>
        )}

        <Card header={<span>All routes</span>}>
          {routeList.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '24px 0', textAlign: 'center' }}>
              No routes configured.
            </div>
          )}
          <div style={{ display: 'grid', gap: 0 }}>
            {routeList.map((route, i) => {
              const h = health[route.id]
              const overallOk = h?.results.every(r => r.ok)
              return (
                <div
                  key={route.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    alignItems: 'start',
                    gap: 12,
                    padding: '12px 0',
                    borderTop: i > 0 ? '0.5px solid var(--border)' : undefined,
                  }}
                >
                  <div>
                    {/* Route header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      {h?.testedAt && (
                        <Dot tone={overallOk ? 'green' : 'red'} />
                      )}
                      {!h?.testedAt && !h?.pending && <Dot tone="neutral" />}
                      {h?.pending && <Dot tone="amber" />}
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{route.domain}</span>
                      <Badge tone={route.enabled ? 'green' : 'neutral'}>{route.enabled ? 'enabled' : 'disabled'}</Badge>
                      {route.tlsMode !== 'off' && <Badge tone="green">TLS</Badge>}
                    </div>

                    {/* Upstream results */}
                    {h?.results.map((r, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 18, marginTop: 4 }}>
                        <Dot tone={r.ok ? 'green' : 'red'} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{r.address}</span>
                        {r.status && <Badge tone={r.ok ? 'green' : 'red'}>{r.status}</Badge>}
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.latencyMs}ms</span>
                        {r.error && <span style={{ fontSize: 11, color: 'var(--red)' }}>{r.error}</span>}
                      </div>
                    ))}

                    {h?.error && (
                      <div style={{ paddingLeft: 18, marginTop: 4, fontSize: 11, color: 'var(--red)' }}>{h.error}</div>
                    )}

                    {h?.testedAt && (
                      <div style={{ paddingLeft: 18, marginTop: 4, fontSize: 10, color: 'var(--text-ghost)' }}>
                        Tested {h.testedAt.toLocaleTimeString()}
                      </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    style={{ fontSize: 11, flexShrink: 0, marginTop: 2 }}
                    disabled={h?.pending}
                    onClick={() => runTest(route.id)}
                  >
                    {h?.pending ? '…' : 'Test'}
                  </Button>
                </div>
              )
            })}
          </div>
        </Card>
      </PageContent>
    </>
  )
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 20,
      background: 'var(--surface-2)', border: '0.5px solid var(--border)',
      fontSize: 11, fontFamily: 'var(--font-sans)',
    }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontWeight: 600, color }}>{value}</span>
    </div>
  )
}
