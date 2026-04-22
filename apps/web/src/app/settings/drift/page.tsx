'use client'

import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card, DataTable, td, th } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

const TYPE_LABELS: Record<string, string> = {
  missing_in_db: 'Missing in DB',
  missing_in_caddy: 'Missing in Caddy',
  config_mismatch: 'Config mismatch',
}

const TYPE_TONE: Record<string, 'red' | 'amber' | 'neutral'> = {
  missing_in_db: 'red',
  missing_in_caddy: 'amber',
  config_mismatch: 'amber',
}

export default function DriftPage() {
  const [handleError] = useErrorHandler()
  const events = trpc.drift.list.useQuery(undefined, { refetchInterval: 10000 })
  const reconcileMut = trpc.drift.reconcile.useMutation({ onSuccess: () => events.refetch(), onError: handleError })

  const unresolved = events.data ?? []

  return (
    <>
      <Topbar title="Config drift" />
      <PageContent>
        <PageHeader
          title="Config drift"
          desc="Routes that are out of sync between the ProxyOS database and the live Caddy configuration. Reconcile to restore consistency."
        />

        <Card header={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>Unresolved drift events ({unresolved.length})</span>
            {unresolved.length > 0 && (
              <Button variant="ghost" style={{ fontSize: 11 }}
                onClick={() => {
                  for (const e of unresolved) {
                    reconcileMut.mutate({ eventId: e.id, action: 'mark_resolved' })
                  }
                }}
                disabled={reconcileMut.isPending}>
                Dismiss all
              </Button>
            )}
          </div>
        }>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '20%' }}>Detected</th>
                <th style={{ ...th, width: '20%' }}>Type</th>
                <th style={{ ...th, width: '30%' }}>Route</th>
                <th style={{ ...th, width: '30%' }}></th>
              </tr>
            </thead>
            <tbody>
              {unresolved.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>
                    No drift detected — ProxyOS and Caddy are in sync.
                  </td>
                </tr>
              )}
              {unresolved.map(e => (
                <tr key={e.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)' }}>
                    {new Date(e.detectedAt).toLocaleString()}
                  </td>
                  <td style={td}>
                    <Badge tone={TYPE_TONE[e.type] ?? 'neutral'}>{TYPE_LABELS[e.type] ?? e.type}</Badge>
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {e.routeId ?? '—'}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {e.routeId && (
                        <Button variant="primary" style={{ fontSize: 11, padding: '2px 10px' }}
                          onClick={() => reconcileMut.mutate({ eventId: e.id, action: 'db_to_caddy' })}
                          disabled={reconcileMut.isPending}>
                          Push DB → Caddy
                        </Button>
                      )}
                      <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => reconcileMut.mutate({ eventId: e.id, action: 'mark_resolved' })}
                        disabled={reconcileMut.isPending}>
                        Dismiss
                      </Button>
                    </div>
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
