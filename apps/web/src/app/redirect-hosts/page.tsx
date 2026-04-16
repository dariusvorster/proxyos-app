'use client'

import { useState } from 'react'
import { Badge, Button, Card, DataTable, Input, Select, SidePanel, td, th, Toggle } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

type RedirectHost = {
  id: string
  sourceDomain: string
  destinationUrl: string
  redirectCode: 301 | 302
  preservePath: boolean
  preserveQuery: boolean
  tlsEnabled: boolean
  accessListId: string | null
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

type FormState = {
  sourceDomain: string
  destinationUrl: string
  redirectCode: 301 | 302
  preservePath: boolean
  preserveQuery: boolean
  tlsEnabled: boolean
  accessListId: string
}

const defaultForm: FormState = {
  sourceDomain: '',
  destinationUrl: '',
  redirectCode: 301,
  preservePath: true,
  preserveQuery: true,
  tlsEnabled: true,
  accessListId: '',
}

export default function RedirectHostsPage() {
  const utils = trpc.useUtils()
  const list = trpc.redirectHosts.list.useQuery()
  const createMut = trpc.redirectHosts.create.useMutation({ onSuccess: () => { utils.redirectHosts.list.invalidate(); closePanel() } })
  const updateMut = trpc.redirectHosts.update.useMutation({ onSuccess: () => { utils.redirectHosts.list.invalidate(); closePanel() } })
  const deleteMut = trpc.redirectHosts.delete.useMutation({ onSuccess: () => utils.redirectHosts.list.invalidate() })
  const toggleMut = trpc.redirectHosts.toggle.useMutation({ onSuccess: () => utils.redirectHosts.list.invalidate() })

  const [panelOpen, setPanelOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [formError, setFormError] = useState<string | null>(null)

  function openCreate() {
    setEditId(null)
    setForm(defaultForm)
    setFormError(null)
    setPanelOpen(true)
  }

  function openEdit(host: RedirectHost) {
    setEditId(host.id)
    setForm({
      sourceDomain: host.sourceDomain,
      destinationUrl: host.destinationUrl,
      redirectCode: host.redirectCode,
      preservePath: host.preservePath,
      preserveQuery: host.preserveQuery,
      tlsEnabled: host.tlsEnabled,
      accessListId: host.accessListId ?? '',
    })
    setFormError(null)
    setPanelOpen(true)
  }

  function closePanel() {
    setPanelOpen(false)
    setEditId(null)
    setForm(defaultForm)
    setFormError(null)
  }

  function handleSubmit() {
    if (!form.sourceDomain.trim()) { setFormError('Source domain is required'); return }
    if (!form.destinationUrl.trim()) { setFormError('Destination URL is required'); return }
    setFormError(null)
    const payload = {
      sourceDomain: form.sourceDomain.trim(),
      destinationUrl: form.destinationUrl.trim(),
      redirectCode: form.redirectCode,
      preservePath: form.preservePath,
      preserveQuery: form.preserveQuery,
      tlsEnabled: form.tlsEnabled,
      accessListId: form.accessListId.trim() || null,
    }
    if (editId) {
      updateMut.mutate({ id: editId, patch: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const isBusy = createMut.isPending || updateMut.isPending

  const rows = list.data ?? []

  return (
    <>
      <Topbar
        title="Redirect hosts"
        actions={<Button variant="primary" onClick={openCreate}>+ Add redirect host</Button>}
      />
      <PageContent>
        <Card header={<><span>Redirect hosts</span><span style={{ color: 'var(--text-dim)' }}>{rows.length}</span></>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '22%' }}>Source domain</th>
                <th style={{ ...th, width: '28%' }}>Destination</th>
                <th style={{ ...th, width: '8%' }}>Type</th>
                <th style={{ ...th, width: '12%' }}>Preserve path</th>
                <th style={{ ...th, width: '10%' }}>Status</th>
                <th style={{ ...th, width: '20%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>
                    No redirect hosts configured.
                  </td>
                </tr>
              )}
              {rows.map((host) => (
                <tr key={host.id}>
                  <td style={{ ...td, fontWeight: 500, color: 'var(--text-primary)' }}>{host.sourceDomain}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {host.destinationUrl}
                  </td>
                  <td style={td}>
                    <Badge tone={host.redirectCode === 301 ? 'green' : 'amber'}>{host.redirectCode}</Badge>
                  </td>
                  <td style={td}>
                    <Badge tone={host.preservePath ? 'green' : 'neutral'}>{host.preservePath ? 'yes' : 'no'}</Badge>
                  </td>
                  <td style={td}>
                    <Badge tone={host.enabled ? 'green' : 'neutral'}>{host.enabled ? 'enabled' : 'disabled'}</Badge>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Button size="sm" onClick={() => openEdit(host)}>Edit</Button>
                      <Button
                        size="sm"
                        onClick={() => toggleMut.mutate({ id: host.id, enabled: !host.enabled })}
                      >
                        {host.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => { if (confirm(`Delete redirect for ${host.sourceDomain}?`)) deleteMut.mutate({ id: host.id }) }}
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
        open={panelOpen}
        onClose={closePanel}
        title={editId ? 'Edit redirect host' : 'Add redirect host'}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <FormField label="Source domain">
            <Input
              placeholder="example.com"
              value={form.sourceDomain}
              onChange={(e) => setForm((f) => ({ ...f, sourceDomain: e.target.value }))}
              disabled={!!editId}
            />
          </FormField>

          <FormField label="Destination URL">
            <Input
              placeholder="https://target.example.com"
              value={form.destinationUrl}
              onChange={(e) => setForm((f) => ({ ...f, destinationUrl: e.target.value }))}
            />
          </FormField>

          <FormField label="Redirect code">
            <Select
              value={String(form.redirectCode)}
              onChange={(e) => setForm((f) => ({ ...f, redirectCode: Number(e.target.value) as 301 | 302 }))}
            >
              <option value="301">301 — Permanent</option>
              <option value="302">302 — Temporary</option>
            </Select>
          </FormField>

          <FormField label="Preserve path">
            <Toggle
              checked={form.preservePath}
              onChange={(v) => setForm((f) => ({ ...f, preservePath: typeof v === 'boolean' ? v : !f.preservePath }))}
            />
          </FormField>

          <FormField label="Preserve query string">
            <Toggle
              checked={form.preserveQuery}
              onChange={(v) => setForm((f) => ({ ...f, preserveQuery: typeof v === 'boolean' ? v : !f.preserveQuery }))}
            />
          </FormField>

          <FormField label="TLS enabled">
            <Toggle
              checked={form.tlsEnabled}
              onChange={(v) => setForm((f) => ({ ...f, tlsEnabled: typeof v === 'boolean' ? v : !f.tlsEnabled }))}
            />
          </FormField>

          <FormField label="Access list ID (optional)">
            <Input
              placeholder="acl_…"
              value={form.accessListId}
              onChange={(e) => setForm((f) => ({ ...f, accessListId: e.target.value }))}
            />
          </FormField>

          {formError && (
            <div style={{ fontSize: 12, color: 'var(--red-500, #ef4444)' }}>{formError}</div>
          )}

          {(createMut.error ?? updateMut.error) && (
            <div style={{ fontSize: 12, color: 'var(--red-500, #ef4444)' }}>
              {(createMut.error ?? updateMut.error)?.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={handleSubmit} disabled={isBusy}>
              {isBusy ? 'Saving…' : editId ? 'Save changes' : 'Create'}
            </Button>
            <Button onClick={closePanel}>Cancel</Button>
          </div>
        </div>
      </SidePanel>
    </>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      {children}
    </div>
  )
}
