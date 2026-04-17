'use client'

import { useState } from 'react'
import { Badge, Button, Card, DataTable, Dot, Input, SidePanel, td, th, Toggle } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

type Protocol = 'tcp' | 'udp' | 'tcp+udp'

interface StreamFormState {
  listenPort: string
  protocol: Protocol
  upstreamHost: string
  upstreamPort: string
}

const defaultForm: StreamFormState = {
  listenPort: '',
  protocol: 'tcp',
  upstreamHost: '',
  upstreamPort: '',
}

export default function StreamsPage() {
  const utils = trpc.useUtils()
  const list = trpc.streams.list.useQuery()
  const createMut = trpc.streams.create.useMutation({ onSuccess: () => { utils.streams.list.invalidate(); setFormOpen(false); setForm(defaultForm) } })
  const updateMut = trpc.streams.update.useMutation({ onSuccess: () => { utils.streams.list.invalidate(); setEditId(null); setForm(defaultForm) } })
  const deleteMut = trpc.streams.delete.useMutation({ onSuccess: () => utils.streams.list.invalidate() })
  const toggleMut = trpc.streams.toggle.useMutation({ onSuccess: () => utils.streams.list.invalidate() })
  const checkMut = trpc.streams.checkUpstream.useMutation()

  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<StreamFormState>(defaultForm)
  const [probeResult, setProbeResult] = useState<{ ok: boolean; latencyMs: number; error?: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  function openCreate() {
    setEditId(null)
    setForm(defaultForm)
    setProbeResult(null)
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(id: string) {
    const s = list.data?.find((x) => x.id === id)
    if (!s) return
    setEditId(id)
    setForm({
      listenPort: String(s.listenPort),
      protocol: s.protocol as Protocol,
      upstreamHost: s.upstreamHost,
      upstreamPort: String(s.upstreamPort),
    })
    setProbeResult(null)
    setFormError(null)
    setFormOpen(true)
  }

  async function handleProbe() {
    if (!form.upstreamHost || !form.upstreamPort) return
    setProbeResult(null)
    const result = await checkMut.mutateAsync({ host: form.upstreamHost, port: Number(form.upstreamPort) })
    setProbeResult(result)
  }

  function handleSubmit() {
    setFormError(null)
    const listenPort = Number(form.listenPort)
    const upstreamPort = Number(form.upstreamPort)
    if (!listenPort || listenPort < 1 || listenPort > 65535) { setFormError('Listen port must be 1–65535'); return }
    if (!form.upstreamHost.trim()) { setFormError('Upstream host is required'); return }
    if (!upstreamPort || upstreamPort < 1 || upstreamPort > 65535) { setFormError('Upstream port must be 1–65535'); return }

    if (editId) {
      updateMut.mutate({ id: editId, patch: { listenPort, protocol: form.protocol, upstreamHost: form.upstreamHost.trim(), upstreamPort } })
    } else {
      createMut.mutate({ listenPort, protocol: form.protocol, upstreamHost: form.upstreamHost.trim(), upstreamPort })
    }
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <>
      <Topbar
        title="Streams"
        actions={<Button variant="primary" onClick={openCreate}>+ Add stream</Button>}
      />
      <PageContent>
        <Card header={<><span>Streams</span><span style={{ color: 'var(--text-dim)' }}>{list.data?.length ?? 0}</span></>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '10%' }}>Listen port</th>
                <th style={{ ...th, width: '30%' }}>Upstream</th>
                <th style={{ ...th, width: '12%' }}>Protocol</th>
                <th style={{ ...th, width: '12%' }}>Status</th>
                <th style={{ ...th, width: '18%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>
                    No streams configured. Add one to forward raw TCP/UDP traffic.
                  </td>
                </tr>
              )}
              {(list.data ?? []).map((s) => (
                <tr key={s.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{s.listenPort}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: 11 }}>
                    {s.upstreamHost}:{s.upstreamPort}
                  </td>
                  <td style={td}>
                    <Badge tone={s.protocol === 'udp' ? 'amber' : s.protocol === 'tcp+udp' ? 'purple' : 'blue'}>
                      {s.protocol.toUpperCase()}
                    </Badge>
                  </td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Dot tone={s.enabled ? 'green' : 'neutral'} />
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{s.enabled ? 'active' : 'disabled'}</span>
                    </span>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Toggle
                        checked={s.enabled}
                        onChange={() => toggleMut.mutate({ id: s.id, enabled: !s.enabled })}
                      />
                      <Button size="sm" onClick={() => openEdit(s.id)}>Edit</Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => { if (confirm(`Delete stream on port ${s.listenPort}?`)) deleteMut.mutate({ id: s.id }) }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>

      <SidePanel
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditId(null); setForm(defaultForm); setProbeResult(null); setFormError(null) }}
        title={editId ? 'Edit stream' : 'Add stream'}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <Field label="Listen port">
            <Input
              type="number"
              min={1}
              max={65535}
              placeholder="e.g. 25565"
              value={form.listenPort}
              onChange={(e) => setForm((f) => ({ ...f, listenPort: e.target.value }))}
            />
          </Field>

          <Field label="Protocol">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {(['tcp', 'udp', 'tcp+udp'] as Protocol[]).map((p) => (
                <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                  <input
                    type="radio"
                    name="protocol"
                    value={p}
                    checked={form.protocol === p}
                    onChange={() => setForm((f) => ({ ...f, protocol: p }))}
                  />
                  {p.toUpperCase()}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Upstream host">
            <Input
              placeholder="e.g. 192.168.1.50"
              value={form.upstreamHost}
              onChange={(e) => { setForm((f) => ({ ...f, upstreamHost: e.target.value })); setProbeResult(null) }}
              onBlur={() => { if (form.upstreamHost && form.upstreamPort) handleProbe() }}
            />
          </Field>

          <Field label="Upstream port">
            <Input
              type="number"
              min={1}
              max={65535}
              placeholder="e.g. 25565"
              value={form.upstreamPort}
              onChange={(e) => { setForm((f) => ({ ...f, upstreamPort: e.target.value })); setProbeResult(null) }}
              onBlur={() => { if (form.upstreamHost && form.upstreamPort) handleProbe() }}
            />
          </Field>

          {checkMut.isPending && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Probing upstream…</div>
          )}
          {probeResult && !checkMut.isPending && (
            <div style={{
              fontSize: 11,
              padding: '6px 10px',
              borderRadius: 6,
              background: probeResult.ok ? 'var(--green-dim, rgba(34,197,94,0.1))' : 'var(--red-dim, rgba(239,68,68,0.1))',
              color: probeResult.ok ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)',
              fontFamily: 'var(--font-mono)',
            }}>
              {probeResult.ok
                ? `Reachable — ${probeResult.latencyMs}ms`
                : `Unreachable — ${probeResult.error ?? 'timeout'}`}
            </div>
          )}

          {formError && (
            <div style={{ fontSize: 11, color: 'var(--red, #dc2626)' }}>{formError}</div>
          )}

          {(createMut.error || updateMut.error) && (
            <div style={{ fontSize: 11, color: 'var(--red, #dc2626)' }}>
              {(createMut.error ?? updateMut.error)?.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Saving…' : editId ? 'Save changes' : 'Add stream'}
            </Button>
            <Button onClick={() => { setFormOpen(false); setEditId(null); setForm(defaultForm); setProbeResult(null); setFormError(null) }}>
              Cancel
            </Button>
          </div>
        </div>
      </SidePanel>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {children}
    </div>
  )
}
