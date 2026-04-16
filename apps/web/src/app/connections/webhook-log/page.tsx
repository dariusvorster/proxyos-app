'use client'

import { useState } from 'react'
import { Badge, Button, Card, Dot } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function WebhookLogPage() {
  const [retrying, setRetrying] = useState<string | null>(null)
  const log = trpc.notifications.webhookLog.useQuery({ limit: 100 })
  const retry = trpc.notifications.retryWebhook.useMutation({
    onSuccess: () => { void log.refetch() },
    onSettled: () => setRetrying(null),
  })

  return (
    <>
      <Topbar title="Webhook delivery log" />
      <PageContent>
        <Card header={<span>Deliveries</span>}>
          {log.isLoading && <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '16px 0' }}>Loading…</div>}
          {log.data?.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '16px 0' }}>No deliveries yet.</div>
          )}
          {log.data && log.data.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                  {['Status', 'Event', 'URL', 'Code', 'Time (ms)', 'Delivered at', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.data.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <Dot tone={row.success ? 'green' : 'red'} />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <Badge tone="purple">{row.eventType}</Badge>
                    </td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.url}
                    </td>
                    <td style={{ padding: '6px 8px', color: row.statusCode && row.statusCode >= 400 ? 'var(--red)' : 'var(--text-secondary)' }}>
                      {row.statusCode ?? '—'}
                    </td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-dim)' }}>
                      {row.responseTimeMs}
                    </td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-dim)', fontSize: 11 }}>
                      {row.deliveredAt ? new Date(row.deliveredAt).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      {!row.success && (
                        <Button
                          variant="ghost"
                          onClick={() => { setRetrying(row.id); retry.mutate({ deliveryId: row.id }) }}
                          disabled={retrying === row.id}
                        >
                          {retrying === row.id ? 'Retrying…' : 'Retry'}
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
