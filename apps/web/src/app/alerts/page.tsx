'use client'

import { useState, type FormEvent } from 'react'
import { Badge, Button, Card, Input, Select } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

type AlertType = 'error_rate_spike' | 'latency_spike' | 'cert_expiring' | 'traffic_spike'

const typeLabels: Record<AlertType, string> = {
  error_rate_spike: 'Error rate spike (5xx)',
  latency_spike: 'Latency spike',
  cert_expiring: 'Certificate expiring',
  traffic_spike: 'Traffic spike',
}

export default function AlertsPage() {
  const utils = trpc.useUtils()
  const routes = trpc.routes.list.useQuery()
  const rules = trpc.alerts.listRules.useQuery()
  const events = trpc.alerts.listEvents.useQuery({ limit: 50 }, { refetchInterval: 10_000 })
  const create = trpc.alerts.createRule.useMutation({
    onSuccess: () => { utils.alerts.listRules.invalidate(); setName(''); setThreshold('5'); setError(null) },
    onError: (e) => setError(e.message),
  })
  const del = trpc.alerts.deleteRule.useMutation({ onSuccess: () => utils.alerts.listRules.invalidate() })
  const toggle = trpc.alerts.toggleRule.useMutation({ onSuccess: () => utils.alerts.listRules.invalidate() })

  const [name, setName] = useState('')
  const [type, setType] = useState<AlertType>('error_rate_spike')
  const [routeId, setRouteId] = useState<string>('')
  const [threshold, setThreshold] = useState('5')
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const n = Number(threshold)
    const config =
      type === 'error_rate_spike' ? { errorRatePct: n, windowMinutes: 5, thresholdRequests: 10 } :
      type === 'latency_spike' ? { p95LatencyMs: n, windowMinutes: 5, thresholdRequests: 10 } :
      type === 'cert_expiring' ? { daysBeforeExpiry: n } :
      { requestsPerMinute: n }
    create.mutate({ name, type, targetRouteId: type === 'cert_expiring' ? null : routeId || null, config })
  }

  const thresholdLabel =
    type === 'error_rate_spike' ? 'Error %' :
    type === 'latency_spike' ? 'Latency ms' :
    type === 'cert_expiring' ? 'Days' :
    'Req/min'

  return (
    <>
      <Topbar title="Alerts" />
      <PageContent>
        <Card header={<span>New rule</span>}>
          <form onSubmit={onSubmit} style={{ padding: '12px 13px', display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Input placeholder="rule name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Select value={type} onChange={(e) => setType(e.target.value as AlertType)}>
                {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
              {type !== 'cert_expiring' && (
                <Select value={routeId} onChange={(e) => setRouteId(e.target.value)} required>
                  <option value="">pick route…</option>
                  {routes.data?.map((r) => <option key={r.id} value={r.id}>{r.domain}</option>)}
                </Select>
              )}
              <Input placeholder={thresholdLabel} value={threshold} onChange={(e) => setThreshold(e.target.value)} type="number" required />
              <Button type="submit" variant="primary" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add rule'}</Button>
            </div>
          </form>
          {error && <div style={{ padding: '0 13px 12px', color: 'var(--red)', fontSize: 11 }}>{error}</div>}
        </Card>

        <Card header={<span>Rules</span>}>
          {rules.data?.length === 0 && <div style={{ padding: '16px 13px', color: 'var(--text-dim)', fontSize: 11 }}>No rules.</div>}
          {rules.data?.map((r) => {
            const target = routes.data?.find((rt) => rt.id === r.targetRouteId)
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderTop: '0.5px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{r.name} <Badge tone={r.enabled ? 'green' : 'neutral'}>{r.enabled ? 'on' : 'off'}</Badge></div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                    {typeLabels[r.type]}{target ? ` · ${target.domain}` : ''} · <code>{JSON.stringify(r.config)}</code>
                  </div>
                  {r.lastFiredAt && <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>last fired · {new Date(r.lastFiredAt).toLocaleString()}</div>}
                </div>
                <Button size="sm" onClick={() => toggle.mutate({ id: r.id, enabled: !r.enabled })}>{r.enabled ? 'Disable' : 'Enable'}</Button>
                <Button size="sm" variant="danger" onClick={() => del.mutate({ id: r.id })}>Remove</Button>
              </div>
            )
          })}
        </Card>

        <Card header={<span>Recent events</span>}>
          {events.data?.length === 0 && <div style={{ padding: '16px 13px', color: 'var(--text-dim)', fontSize: 11 }}>None yet.</div>}
          {events.data?.map((e) => (
            <div key={e.id} style={{ padding: '11px 13px', borderTop: '0.5px solid var(--border)', borderLeft: '2px solid var(--amber)' }}>
              <div style={{ fontWeight: 500 }}>{e.message}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{new Date(e.firedAt).toLocaleString()}</div>
            </div>
          ))}
        </Card>
      </PageContent>
    </>
  )
}
