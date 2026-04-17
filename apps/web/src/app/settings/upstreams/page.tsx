'use client'

import { useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card } from '~/components/ui'
import { trpc } from '~/lib/trpc'

interface FormState {
  name: string
  host: string
  defaultPort: string
  defaultScheme: 'http' | 'https'
  description: string
  tlsSkipVerify: boolean
}

const emptyForm = (): FormState => ({
  name: '',
  host: '',
  defaultPort: '',
  defaultScheme: 'http',
  description: '',
  tlsSkipVerify: false,
})

export default function UpstreamsPage() {
  const upstreams = trpc.upstreams.list.useQuery()
  const createMut = trpc.upstreams.create.useMutation({ onSuccess: () => { upstreams.refetch(); setEditing(null) } })
  const updateMut = trpc.upstreams.update.useMutation({ onSuccess: () => { upstreams.refetch(); setEditing(null) } })
  const deleteMut = trpc.upstreams.delete.useMutation({ onSuccess: () => upstreams.refetch() })

  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [err, setErr] = useState('')

  function openNew() {
    setForm(emptyForm())
    setErr('')
    setEditing('new')
  }

  function openEdit(u: NonNullable<typeof upstreams.data>[number]) {
    setForm({
      name: u.name,
      host: u.host,
      defaultPort: u.defaultPort ? String(u.defaultPort) : '',
      defaultScheme: u.defaultScheme as 'http' | 'https',
      description: u.description ?? '',
      tlsSkipVerify: Boolean(u.tlsSkipVerify),
    })
    setErr('')
    setEditing(u.id)
  }

  function close() { setEditing(null); setErr('') }

  async function save() {
    setErr('')
    const payload = {
      name: form.name,
      host: form.host,
      defaultPort: form.defaultPort ? parseInt(form.defaultPort, 10) : undefined,
      defaultScheme: form.defaultScheme,
      description: form.description || undefined,
      tlsSkipVerify: form.tlsSkipVerify,
    }
    try {
      if (editing === 'new') {
        await createMut.mutateAsync(payload)
      } else if (editing) {
        await updateMut.mutateAsync({ id: editing, ...payload })
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  const inp = (style?: React.CSSProperties) => ({
    style: {
      padding: '6px 8px',
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 4,
      color: 'var(--text)',
      fontSize: 12,
      fontFamily: 'var(--font-mono)',
      width: '100%',
      ...style,
    } as React.CSSProperties,
  })

  return (
    <>
      <Topbar
        title="Static Upstreams"
        actions={<Button variant="primary" onClick={openNew}>+ Add upstream</Button>}
      />
      <PageContent>
        <PageHeader
          title="Static upstreams"
          desc="Define non-Docker upstreams (bare-metal, VMs, NAS, Tailscale nodes) by name. Reference them in routes as http://name:port."
        />

        {editing && (
          <Card header={<span>{editing === 'new' ? 'Add upstream' : 'Edit upstream'}</span>}>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Name <span style={{ color: 'var(--red)' }}>*</span></div>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="truenas" disabled={editing !== 'new'} {...inp()} />
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>Lowercase letters, digits, hyphens. Used as <code style={{ fontFamily: 'var(--font-mono)' }}>http://{form.name || 'name'}</code> in routes.</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Host <span style={{ color: 'var(--red)' }}>*</span></div>
                  <input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                    placeholder="192.168.1.50 or host.tailnet.ts.net" {...inp()} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Default port</div>
                  <input value={form.defaultPort} onChange={e => setForm(f => ({ ...f, defaultPort: e.target.value }))}
                    placeholder="80" type="number" {...inp()} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Default scheme</div>
                  <select value={form.defaultScheme} onChange={e => setForm(f => ({ ...f, defaultScheme: e.target.value as 'http' | 'https' }))}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
                    <option value="http">http</option>
                    <option value="https">https</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Description</div>
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Main NAS, web UI" {...inp({ fontFamily: 'inherit' })} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.tlsSkipVerify} onChange={e => setForm(f => ({ ...f, tlsSkipVerify: e.target.checked }))} />
                Allow self-signed TLS certificates (skip verify)
              </label>
              {err && <div style={{ fontSize: 12, color: 'var(--red)' }}>{err}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={close}>Cancel</Button>
                <Button variant="primary" onClick={save} disabled={!form.name || !form.host || createMut.isPending || updateMut.isPending}>Save</Button>
              </div>
            </div>
          </Card>
        )}

        <Card header={<span>Upstreams ({upstreams.data?.length ?? 0})</span>}>
          {!upstreams.data?.length ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              No static upstreams defined. Add one to reference non-Docker services by name in routes.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Name', 'Host', 'Scheme', 'Description', ''].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text2)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upstreams.data.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text)', fontWeight: 500 }}>{u.name}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
                      {u.host}{u.defaultPort ? `:${u.defaultPort}` : ''}
                      {u.tlsSkipVerify ? <Badge tone="amber" >skip-verify</Badge> : null}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{u.defaultScheme}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text3)' }}>{u.description ?? '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => deleteMut.mutate({ id: u.id })} disabled={deleteMut.isPending}>Delete</Button>
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
