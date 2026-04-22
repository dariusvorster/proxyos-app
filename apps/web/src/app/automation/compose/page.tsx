'use client'

import { useState } from 'react'
import { Badge, Button, Card, DataTable, Input, Toggle, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

export default function ComposeWatcherPage() {
  const [handleError] = useErrorHandler()
  const utils = trpc.useUtils()
  const list = trpc.automation.listComposeWatchers.useQuery(undefined, { refetchInterval: 10_000 })
  const create = trpc.automation.createComposeWatcher.useMutation({
    onSuccess: () => { utils.automation.listComposeWatchers.invalidate(); setShowForm(false); setPath(''); setInterval_('30') },
    onError: handleError,
  })
  const toggle = trpc.automation.toggleComposeWatcher.useMutation({
    onSuccess: () => utils.automation.listComposeWatchers.invalidate(),
    onError: handleError,
  })
  const del = trpc.automation.deleteComposeWatcher.useMutation({
    onSuccess: () => utils.automation.listComposeWatchers.invalidate(),
    onError: handleError,
  })

  const [showForm, setShowForm] = useState(false)
  const [path, setPath] = useState('')
  const [autoApply, setAutoApply] = useState(true)
  const [interval_, setInterval_] = useState('30')

  return (
    <>
      <Topbar
        title="Compose watcher"
        actions={<Button variant="primary" onClick={() => setShowForm(v => !v)}>+ Add watcher</Button>}
      />
      <PageContent>
        {showForm && (
          <Card header={<span>New compose watcher</span>} style={{ marginBottom: 8 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Field label="Docker Compose project path">
                <Input value={path} onChange={e => setPath(e.target.value)} placeholder="/opt/gitbay" />
              </Field>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12 }}>Auto-apply changes</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Apply route changes immediately without approval</div>
                </div>
                <Toggle checked={autoApply} onChange={setAutoApply} />
              </div>
              <Field label="Poll interval (seconds)">
                <Input type="number" value={interval_} onChange={e => setInterval_(e.target.value)} />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" onClick={() => create.mutate({ projectPath: path, autoApply, watchInterval: Number(interval_) })} disabled={!path || create.isPending}>Add</Button>
                <Button onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        <Card header={<span>Active watchers</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '35%' }}>Project path</th>
                <th style={{ ...th, width: '12%' }}>Auto-apply</th>
                <th style={{ ...th, width: '12%' }}>Interval</th>
                <th style={{ ...th, width: '12%' }}>Status</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {list.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No watchers — add one to auto-sync routes from docker-compose.yml labels.</td></tr>
              )}
              {list.data?.map(w => (
                <tr key={w.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{w.projectPath}</td>
                  <td style={td}><Badge tone={w.autoApply ? 'green' : 'amber'}>{w.autoApply ? 'auto' : 'manual'}</Badge></td>
                  <td style={{ ...td, color: 'var(--text-dim)' }}>{w.watchInterval}s</td>
                  <td style={td}><Badge tone={w.running ? 'green' : 'neutral'}>{w.running ? 'running' : 'stopped'}</Badge></td>
                  <td style={{ ...td }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="sm" onClick={() => toggle.mutate({ id: w.id, enabled: !w.enabled })} disabled={toggle.isPending}>
                        {w.enabled ? 'Stop' : 'Start'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => del.mutate({ id: w.id })} disabled={del.isPending}>Remove</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Compose label format</div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>{`services:
  gitbay:
    image: gitea/gitea
    labels:
      proxyos.domain: gitbay.homelabza.com
      proxyos.upstream: "192.168.69.10:3000"
      proxyos.tls_mode: auto
      proxyos.sso_enabled: "true"`}</pre>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
            ProxyOS polls the compose file every N seconds. When labels change, routes are added, updated, or removed automatically.
          </div>
        </Card>
      </PageContent>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      {children}
    </label>
  )
}
