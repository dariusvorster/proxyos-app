'use client'

import { useState } from 'react'
import { Badge, Button, Card, DataTable, Input, Select, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

type PageType = 'default' | 'custom_html' | 'redirect'

interface FormState {
  domain: string
  statusCode: number
  pageType: PageType
  customHtml: string
  redirectUrl: string
  tlsEnabled: boolean
}

const defaultForm: FormState = {
  domain: '',
  statusCode: 404,
  pageType: 'default',
  customHtml: '',
  redirectUrl: '',
  tlsEnabled: true,
}

export default function ErrorHostsPage() {
  const utils = trpc.useUtils()
  const list = trpc.errorHosts.list.useQuery()
  const create = trpc.errorHosts.create.useMutation({ onSuccess: () => { utils.errorHosts.list.invalidate(); setShowForm(false); setForm(defaultForm) } })
  const update = trpc.errorHosts.update.useMutation({ onSuccess: () => { utils.errorHosts.list.invalidate(); setEditId(null); setForm(defaultForm) } })
  const del = trpc.errorHosts.delete.useMutation({ onSuccess: () => utils.errorHosts.list.invalidate() })
  const toggle = trpc.errorHosts.toggle.useMutation({ onSuccess: () => utils.errorHosts.list.invalidate() })

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm)

  function openCreate() {
    setEditId(null)
    setForm(defaultForm)
    setShowForm(true)
  }

  function openEdit(host: typeof list.data extends (infer T)[] | undefined ? T : never) {
    if (!host) return
    setEditId((host as { id: string }).id)
    setForm({
      domain: (host as { domain: string }).domain,
      statusCode: (host as { statusCode: number }).statusCode,
      pageType: (host as { pageType: PageType }).pageType,
      customHtml: (host as { customHtml: string | null }).customHtml ?? '',
      redirectUrl: (host as { redirectUrl: string | null }).redirectUrl ?? '',
      tlsEnabled: (host as { tlsEnabled: boolean }).tlsEnabled,
    })
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      domain: form.domain,
      statusCode: form.statusCode,
      pageType: form.pageType,
      customHtml: form.customHtml || null,
      redirectUrl: form.redirectUrl || null,
      tlsEnabled: form.tlsEnabled,
    }
    if (editId) {
      update.mutate({ id: editId, patch: payload })
    } else {
      create.mutate(payload)
    }
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm(defaultForm)
  }

  const hosts = list.data ?? []

  return (
    <>
      <Topbar
        title="Error hosts"
        actions={<Button variant="primary" onClick={openCreate}>+ Add error host</Button>}
      />
      <PageContent>
        {showForm && (
          <Card header={<span>{editId ? 'Edit error host' : 'New error host'}</span>}>
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>Domain</label>
                <Input
                  value={form.domain}
                  onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                  placeholder="error.example.com"
                  required
                />
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>Status code</label>
                <Input
                  type="number"
                  value={form.statusCode}
                  onChange={(e) => setForm((f) => ({ ...f, statusCode: parseInt(e.target.value, 10) || 404 }))}
                  placeholder="404"
                />
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>Page type</label>
                <Select
                  value={form.pageType}
                  onChange={(e) => setForm((f) => ({ ...f, pageType: e.target.value as PageType }))}
                >
                  <option value="default">Default</option>
                  <option value="custom_html">Custom HTML</option>
                  <option value="redirect">Redirect</option>
                </Select>
              </div>
              {form.pageType === 'custom_html' && (
                <div style={{ display: 'grid', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>Custom HTML</label>
                  <textarea
                    value={form.customHtml}
                    onChange={(e) => setForm((f) => ({ ...f, customHtml: e.target.value }))}
                    placeholder="<!DOCTYPE html>..."
                    rows={8}
                    style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surf2)', color: 'var(--text)', resize: 'vertical' }}
                  />
                </div>
              )}
              {form.pageType === 'redirect' && (
                <div style={{ display: 'grid', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>Redirect URL</label>
                  <Input
                    value={form.redirectUrl}
                    onChange={(e) => setForm((f) => ({ ...f, redirectUrl: e.target.value }))}
                    placeholder="https://example.com"
                  />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="tls-enabled"
                  checked={form.tlsEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, tlsEnabled: e.target.checked }))}
                />
                <label htmlFor="tls-enabled" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>TLS enabled</label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" type="submit" disabled={create.isPending || update.isPending}>
                  {editId ? 'Save changes' : 'Create'}
                </Button>
                <Button type="button" onClick={cancelForm}>Cancel</Button>
              </div>
              {(create.error || update.error) && (
                <div style={{ fontSize: 12, color: 'var(--red-400)' }}>
                  {(create.error ?? update.error)?.message}
                </div>
              )}
            </form>
          </Card>
        )}

        <Card header={<><span>Error hosts</span><span style={{ color: 'var(--text-dim)' }}>{hosts.length}</span></>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '28%' }}>Domain</th>
                <th style={{ ...th, width: '14%' }}>Status code</th>
                <th style={{ ...th, width: '18%' }}>Page type</th>
                <th style={{ ...th, width: '12%' }}>Active</th>
                <th style={{ ...th, width: '28%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {hosts.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>
                    No error hosts configured.
                  </td>
                </tr>
              )}
              {hosts.map((host) => (
                <tr key={host.id}>
                  <td style={{ ...td, fontWeight: 500 }}>{host.domain}</td>
                  <td style={td}>
                    <Badge tone={host.statusCode >= 500 ? 'red' : host.statusCode >= 400 ? 'amber' : 'neutral'}>
                      {host.statusCode}
                    </Badge>
                  </td>
                  <td style={td}>
                    <Badge tone={host.pageType === 'redirect' ? 'purple' : host.pageType === 'custom_html' ? 'blue' : 'neutral'}>
                      {host.pageType}
                    </Badge>
                  </td>
                  <td style={td}>
                    {host.enabled
                      ? <Badge tone="green">Active</Badge>
                      : <Badge tone="neutral">Disabled</Badge>}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="sm" onClick={() => openEdit(host)}>Edit</Button>
                      <Button
                        size="sm"
                        onClick={() => toggle.mutate({ id: host.id, enabled: !host.enabled })}
                      >
                        {host.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => { if (confirm(`Delete ${host.domain}?`)) del.mutate({ id: host.id }) }}
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
    </>
  )
}
