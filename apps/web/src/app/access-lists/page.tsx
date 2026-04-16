'use client'

import { useState } from 'react'
import { Badge, Button, Card, DataTable, Input, Select, SidePanel, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

type SatisfyMode = 'any' | 'all'

interface IpRuleDraft {
  type: 'allow' | 'deny'
  value: string
  comment: string
}

interface AuthUserDraft {
  username: string
  password: string
}

interface FormState {
  name: string
  description: string
  satisfyMode: SatisfyMode
  ipRules: IpRuleDraft[]
  basicAuthEnabled: boolean
  realm: string
  authUsers: AuthUserDraft[]
  protectedPaths: string
}

const emptyForm = (): FormState => ({
  name: '',
  description: '',
  satisfyMode: 'any',
  ipRules: [],
  basicAuthEnabled: false,
  realm: 'ProxyOS',
  authUsers: [],
  protectedPaths: '',
})

export default function AccessListsPage() {
  const utils = trpc.useUtils()
  const list = trpc.accessLists.list.useQuery()
  const createMut = trpc.accessLists.create.useMutation({ onSuccess: () => { utils.accessLists.list.invalidate(); setPanel(null) } })
  const updateMut = trpc.accessLists.update.useMutation({ onSuccess: () => { utils.accessLists.list.invalidate(); setPanel(null) } })
  const deleteMut = trpc.accessLists.delete.useMutation({ onSuccess: () => utils.accessLists.list.invalidate() })

  const [panel, setPanel] = useState<'create' | { id: string } | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [testIp, setTestIp] = useState('')
  const [testResult, setTestResult] = useState<{ result: 'allow' | 'deny'; matchedRule: string | null } | null>(null)
  const testIpMut = trpc.accessLists.testIp.useMutation({ onSuccess: (r) => setTestResult(r) })

  function openCreate() {
    setForm(emptyForm())
    setTestResult(null)
    setTestIp('')
    setPanel('create')
  }

  function openEdit(id: string) {
    const item = list.data?.find((a) => a.id === id)
    if (!item) return
    setForm({
      name: item.name,
      description: item.description ?? '',
      satisfyMode: item.satisfyMode,
      ipRules: [],
      basicAuthEnabled: item.authUserCount > 0,
      realm: 'ProxyOS',
      authUsers: [],
      protectedPaths: '',
    })
    setTestResult(null)
    setTestIp('')
    setPanel({ id })
  }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function addIpRule() {
    setField('ipRules', [...form.ipRules, { type: 'allow', value: '', comment: '' }])
  }

  function updateIpRule(i: number, patch: Partial<IpRuleDraft>) {
    const next = [...form.ipRules]
    next[i] = { ...next[i], ...patch } as IpRuleDraft
    setField('ipRules', next)
  }

  function moveIpRule(i: number, dir: -1 | 1) {
    const next = [...form.ipRules]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    const tmp = next[i]!
    next[i] = next[j]!
    next[j] = tmp
    setField('ipRules', next)
  }

  function removeIpRule(i: number) {
    setField('ipRules', form.ipRules.filter((_, idx) => idx !== i))
  }

  function addAuthUser() {
    setField('authUsers', [...form.authUsers, { username: '', password: '' }])
  }

  function updateAuthUser(i: number, patch: Partial<AuthUserDraft>) {
    const next = [...form.authUsers]
    next[i] = { ...next[i], ...patch } as AuthUserDraft
    setField('authUsers', next)
  }

  function removeAuthUser(i: number) {
    setField('authUsers', form.authUsers.filter((_, idx) => idx !== i))
  }

  function buildPayload() {
    return {
      name: form.name,
      description: form.description || null,
      satisfyMode: form.satisfyMode,
      ipRules: form.ipRules.filter((r) => r.value.trim()).map((r) => ({
        type: r.type,
        value: r.value.trim(),
        comment: r.comment.trim() || undefined,
      })),
      basicAuth: form.basicAuthEnabled
        ? {
            enabled: true,
            realm: form.realm || 'ProxyOS',
            users: form.authUsers.filter((u) => u.username.trim() && u.password),
            protectedPaths: form.protectedPaths.split('\n').map((p) => p.trim()).filter(Boolean),
          }
        : null,
    }
  }

  function handleSubmit() {
    const payload = buildPayload()
    if (panel === 'create') {
      createMut.mutate(payload)
    } else if (panel && typeof panel === 'object') {
      updateMut.mutate({ ...payload, id: panel.id })
    }
  }

  const editId = panel && typeof panel === 'object' ? panel.id : null
  const isOpen = panel !== null
  const isMutating = createMut.isPending || updateMut.isPending

  const preview = buildPreview(form)

  return (
    <>
      <Topbar title="Access lists" actions={<Button variant="primary" onClick={openCreate}>+ Create access list</Button>} />
      <PageContent>
        <Card header={<><span>Access lists</span><span style={{ color: 'var(--text-dim)' }}>{list.data?.length ?? 0}</span></>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '22%' }}>Name</th>
                <th style={{ ...th, width: '25%' }}>Description</th>
                <th style={{ ...th, width: '10%' }}>IP rules</th>
                <th style={{ ...th, width: '10%' }}>Auth users</th>
                <th style={{ ...th, width: '12%' }}>Satisfy mode</th>
                <th style={{ ...th, width: '21%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>
                    No access lists yet. Create one to get started.
                  </td>
                </tr>
              )}
              {(list.data ?? []).map((al) => (
                <tr key={al.id}>
                  <td style={{ ...td, fontWeight: 500 }}>{al.name}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 11 }}>{al.description ?? '—'}</td>
                  <td style={td}>{al.ipRuleCount}</td>
                  <td style={td}>{al.authUserCount}</td>
                  <td style={td}>
                    <Badge tone={al.satisfyMode === 'all' ? 'purple' : 'neutral'}>{al.satisfyMode}</Badge>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="sm" onClick={() => openEdit(al.id)}>Edit</Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => { if (confirm(`Delete "${al.name}"?`)) deleteMut.mutate({ id: al.id }) }}
                      >Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>

      <SidePanel
        open={isOpen}
        onClose={() => setPanel(null)}
        title={panel === 'create' ? 'Create access list' : 'Edit access list'}
      >
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Name + description */}
          <Section title="Details">
            <label style={labelStyle}>Name</label>
            <Input value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. Internal only" />
            <label style={{ ...labelStyle, marginTop: 8 }}>Description</label>
            <Input value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="Optional description" />
          </Section>

          {/* Satisfy mode */}
          <Section title="Satisfy mode">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <RadioOption
                checked={form.satisfyMode === 'any'}
                onChange={() => setField('satisfyMode', 'any')}
                label="Allow if IP OR auth passes"
              />
              <RadioOption
                checked={form.satisfyMode === 'all'}
                onChange={() => setField('satisfyMode', 'all')}
                label="Require IP AND auth to both pass"
              />
            </div>
          </Section>

          {/* IP rules */}
          <Section title="IP rules">
            {form.ipRules.map((rule, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <Select
                  value={rule.type}
                  onChange={(e) => updateIpRule(i, { type: e.target.value as 'allow' | 'deny' })}
                  style={{ width: 72 }}
                >
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                </Select>
                <Input
                  value={rule.value}
                  onChange={(e) => updateIpRule(i, { value: e.target.value })}
                  placeholder="192.168.1.0/24"
                  style={{ flex: 1 }}
                />
                <Input
                  value={rule.comment}
                  onChange={(e) => updateIpRule(i, { comment: e.target.value })}
                  placeholder="Comment"
                  style={{ width: 100 }}
                />
                <Button size="sm" onClick={() => moveIpRule(i, -1)} disabled={i === 0}>↑</Button>
                <Button size="sm" onClick={() => moveIpRule(i, 1)} disabled={i === form.ipRules.length - 1}>↓</Button>
                <Button size="sm" variant="danger" onClick={() => removeIpRule(i)}>✕</Button>
              </div>
            ))}
            <Button size="sm" onClick={addIpRule}>+ Add IP rule</Button>

            {editId && (
              <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
                <Input
                  value={testIp}
                  onChange={(e) => setTestIp(e.target.value)}
                  placeholder="Test IP address"
                  style={{ flex: 1 }}
                />
                <Button
                  size="sm"
                  onClick={() => testIpMut.mutate({ id: editId, ip: testIp })}
                  disabled={!testIp.trim()}
                >Test</Button>
              </div>
            )}
            {testResult && (
              <div style={{ marginTop: 6, fontSize: 11 }}>
                Result: <Badge tone={testResult.result === 'allow' ? 'green' : 'red'}>{testResult.result}</Badge>
                {testResult.matchedRule && <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>matched: {testResult.matchedRule}</span>}
                {!testResult.matchedRule && <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>no rule matched (default deny)</span>}
              </div>
            )}
          </Section>

          {/* Basic auth */}
          <Section title="Basic auth">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.basicAuthEnabled}
                onChange={(e) => setField('basicAuthEnabled', e.target.checked)}
              />
              Enable HTTP basic authentication
            </label>

            {form.basicAuthEnabled && (
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                <label style={labelStyle}>Realm</label>
                <Input value={form.realm} onChange={(e) => setField('realm', e.target.value)} placeholder="ProxyOS" />

                <label style={labelStyle}>Users</label>
                {form.authUsers.map((u, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Input
                      value={u.username}
                      onChange={(e) => updateAuthUser(i, { username: e.target.value })}
                      placeholder="Username"
                      style={{ flex: 1 }}
                    />
                    <Input
                      type="password"
                      value={u.password}
                      onChange={(e) => updateAuthUser(i, { password: e.target.value })}
                      placeholder="Password"
                      style={{ flex: 1 }}
                    />
                    <Button size="sm" variant="danger" onClick={() => removeAuthUser(i)}>✕</Button>
                  </div>
                ))}
                <Button size="sm" onClick={addAuthUser}>+ Add user</Button>

                <label style={labelStyle}>Protected paths (one per line, empty = whole route)</label>
                <textarea
                  value={form.protectedPaths}
                  onChange={(e) => setField('protectedPaths', e.target.value)}
                  placeholder={'/admin\n/api/private'}
                  rows={3}
                  style={{
                    width: '100%',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    padding: '6px 8px',
                    background: 'var(--input-bg, var(--surf))',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
          </Section>

          {/* Preview */}
          <Section title="Summary">
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {preview.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </Section>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={handleSubmit} disabled={!form.name.trim() || isMutating}>
              {isMutating ? 'Saving…' : panel === 'create' ? 'Create' : 'Save changes'}
            </Button>
            <Button onClick={() => setPanel(null)}>Cancel</Button>
          </div>

          {(createMut.error ?? updateMut.error) && (
            <div style={{ color: 'var(--red, #ef4444)', fontSize: 11 }}>
              {(createMut.error ?? updateMut.error)?.message}
            </div>
          )}
        </div>
      </SidePanel>
    </>
  )
}

function buildPreview(form: FormState): string[] {
  const lines: string[] = []
  if (!form.name) {
    lines.push('Give this access list a name to see a summary.')
    return lines
  }
  lines.push(`Name: ${form.name}`)
  if (form.ipRules.length > 0) {
    const allows = form.ipRules.filter((r) => r.type === 'allow').length
    const denies = form.ipRules.filter((r) => r.type === 'deny').length
    lines.push(`IP rules: ${allows} allow, ${denies} deny — evaluated top-to-bottom`)
  } else {
    lines.push('No IP rules — IP matching is unrestricted.')
  }
  if (form.basicAuthEnabled) {
    lines.push(`Basic auth: enabled (realm: ${form.realm || 'ProxyOS'}, ${form.authUsers.length} user(s))`)
    const paths = form.protectedPaths.split('\n').map((p) => p.trim()).filter(Boolean)
    lines.push(paths.length > 0 ? `Protected paths: ${paths.join(', ')}` : 'Protected paths: entire route')
  } else {
    lines.push('Basic auth: disabled')
  }
  lines.push(
    form.satisfyMode === 'all'
      ? 'Access requires: IP rules AND basic auth must both pass.'
      : 'Access requires: IP rules OR basic auth passing is sufficient.',
  )
  return lines
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: 'grid', gap: 4 }}>{children}</div>
    </div>
  )
}

function RadioOption({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
      <input type="radio" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-dim)',
  fontWeight: 500,
}
