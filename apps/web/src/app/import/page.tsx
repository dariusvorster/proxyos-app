'use client'

import Link from 'next/link'
import { useState, useRef, type ChangeEvent } from 'react'
import { Badge, Button, Card, Checkbox, Input, Select, StepIndicator, Toggle } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import type { ImportedRoute } from '@proxyos/importers'

const STEPS = ['Source', 'Input', 'Preview', 'Options', 'Import']

type Source = 'nginx' | 'npm' | 'traefik' | 'caddy' | 'apache' | 'haproxy'

const SOURCES: Array<{ id: Source; name: string; fidelity: 'perfect' | 'high' | 'medium'; desc: string; needsUrl: boolean }> = [
  { id: 'npm',     name: 'Nginx Proxy Manager', fidelity: 'high',    desc: 'Upload database.sqlite or paste JSON rows.', needsUrl: false },
  { id: 'traefik', name: 'Traefik',              fidelity: 'high',    desc: 'Live API, YAML/TOML file, or Docker labels.', needsUrl: true },
  { id: 'caddy',   name: 'Caddy',                fidelity: 'perfect', desc: 'Native source — perfect import via Admin API.', needsUrl: true },
  { id: 'nginx',   name: 'Nginx',                fidelity: 'high',    desc: '.conf file or sites-enabled/ zip.', needsUrl: false },
  { id: 'apache',  name: 'Apache',               fidelity: 'medium',  desc: 'httpd.conf or VirtualHost files.', needsUrl: false },
  { id: 'haproxy', name: 'HAProxy',              fidelity: 'medium',  desc: 'haproxy.cfg file.', needsUrl: false },
]

export default function ImportPage() {
  const utils = trpc.useUtils()
  const previewMut = trpc.importers.preview.useMutation()
  const commitMut  = trpc.importers.commit.useMutation({
    onSuccess: () => utils.routes.list.invalidate(),
  })

  const [step, setStep]         = useState(0)
  const [source, setSource]     = useState<Source | null>(null)
  const [apiUrl, setApiUrl]     = useState('')
  const [fileContent, setFileContent] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [defaultTls, setDefaultTls] = useState<'auto' | 'dns' | 'internal' | 'off'>('auto')
  const [agentId, setAgentId]   = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  const agentList = trpc.agents.list.useQuery()
  const preview = previewMut.data
  const sessionId = preview?.sessionId

  function canAdvance() {
    if (step === 0) return source !== null
    if (step === 1) return !!(apiUrl || fileContent)
    return true
  }

  async function onPreview() {
    if (!source) return
    await previewMut.mutateAsync({
      sourceType: source,
      content: fileContent || undefined,
      apiUrl: apiUrl || undefined,
    })
    setStep(2)
  }

  async function onCommit() {
    if (!sessionId) return
    await commitMut.mutateAsync({
      sessionId,
      routeIndices: Array.from(selected),
      agentId: agentId || null,
      defaultTlsMode: defaultTls,
    })
    setStep(4)
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setFileContent(ev.target?.result as string ?? '')
    reader.readAsText(file)
  }

  function toggleSelect(i: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function selectAll(routes: ImportedRoute[]) {
    if (selected.size === routes.length) setSelected(new Set())
    else setSelected(new Set(routes.map((_, i) => i)))
  }

  const sourceConfig = SOURCES.find(s => s.id === source)

  return (
    <>
      <Topbar title="Import" actions={<Link href="/import/history"><Button variant="ghost">Import history</Button></Link>} />
      <PageContent>
        <div style={{ marginBottom: 20 }}><StepIndicator steps={STEPS} active={step} /></div>

        {/* Step 0 — source selection */}
        {step === 0 && (
          <Card header={<span>Select source</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {SOURCES.map(s => (
                <button key={s.id} onClick={() => setSource(s.id)} style={{
                  textAlign: 'left', padding: 12,
                  border: source === s.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: source === s.id ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                  borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500, fontSize: 12 }}>{s.name}</span>
                    <Badge tone={s.fidelity === 'perfect' ? 'green' : s.fidelity === 'high' ? 'green' : 'amber'}>{s.fidelity}</Badge>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{s.desc}</div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Step 1 — input */}
        {step === 1 && source && (
          <Card header={<span>Input — {source}</span>}>
            {sourceConfig?.needsUrl && (
              <label style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {source === 'caddy' ? 'Admin API URL' : 'Live API URL'}
                </span>
                <Input
                  value={apiUrl}
                  onChange={e => setApiUrl(e.target.value)}
                  placeholder={source === 'caddy' ? 'http://192.168.69.10:2019' : 'http://traefik-host:8080'}
                />
              </label>
            )}
            {source !== 'caddy' && (
              <>
                {sourceConfig?.needsUrl && (
                  <div style={{ margin: '10px 0', fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>— OR upload file —</div>
                )}
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{ padding: 20, border: '1px dashed var(--border)', borderRadius: 6, textAlign: 'center', cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)' }}>
                  {fileContent ? `✓ File loaded (${fileContent.length.toLocaleString()} chars)` : 'Click to upload config file'}
                </div>
                <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFileChange} />
              </>
            )}
            {previewMut.isError && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)', fontSize: 11 }}>
                {previewMut.error.message}
              </div>
            )}
          </Card>
        )}

        {/* Step 2 — preview */}
        {step === 2 && preview && (
          <Card header={<span>Preview — {preview.routes.length} routes detected</span>}>
            {preview.parseErrors.length > 0 && (
              <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: 'color-mix(in srgb, var(--amber) 10%, transparent)', color: 'var(--amber)', fontSize: 11 }}>
                Parse warnings: {preview.parseErrors.join(' · ')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 24, marginBottom: 12, fontSize: 11 }}>
              <span><strong>{preview.routes.length}</strong> <span style={{ color: 'var(--text-dim)' }}>detected</span></span>
              <span><strong style={{ color: 'var(--green)' }}>{preview.routes.filter(r => r.canAutoImport).length}</strong> <span style={{ color: 'var(--text-dim)' }}>ready</span></span>
              <span><strong style={{ color: 'var(--amber)' }}>{preview.routes.filter(r => !r.canAutoImport).length}</strong> <span style={{ color: 'var(--text-dim)' }}>need review</span></span>
            </div>
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Checkbox
                checked={selected.size === preview.routes.length}
                onChange={() => selectAll(preview.routes)}
              />
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{selected.size} selected</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  {['', 'Domain', 'Upstream', 'TLS', 'SSO', 'Confidence', 'Warnings'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.routes.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)', opacity: r.canAutoImport ? 1 : 0.7 }}>
                    <td style={{ padding: '6px 8px' }}>
                      <Checkbox checked={selected.has(i)} onChange={() => toggleSelect(i)} />
                    </td>
                    <td style={{ padding: '6px 8px', fontWeight: 500 }}>{r.domain}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)' }}>{r.upstream || '—'}</td>
                    <td style={{ padding: '6px 8px' }}><Badge tone="neutral">{r.suggestedTlsMode}</Badge></td>
                    <td style={{ padding: '6px 8px' }}>{r.ssoDetected ? <Badge tone="green">SSO</Badge> : '—'}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <Badge tone={r.confidence === 'high' ? 'green' : r.confidence === 'medium' ? 'amber' : 'red'}>
                        {r.confidence}
                      </Badge>
                    </td>
                    <td style={{ padding: '6px 8px', color: 'var(--amber)', fontSize: 10 }}>
                      {r.warnings.join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Step 3 — options */}
        {step === 3 && (
          <Card header={<span>Options</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assign to agent</span>
                <Select value={agentId} onChange={e => setAgentId(e.target.value)}>
                  <option value="">Local (this node)</option>
                  {agentList.data?.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Default TLS mode</span>
                <Select value={defaultTls} onChange={e => setDefaultTls(e.target.value as typeof defaultTls)}>
                  <option value="auto">auto (Let's Encrypt)</option>
                  <option value="dns">dns (DNS-01)</option>
                  <option value="internal">internal (Caddy CA)</option>
                  <option value="off">off</option>
                </Select>
              </label>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {selected.size} routes will be imported · {(preview?.routes.length ?? 0) - selected.size} skipped
            </div>
          </Card>
        )}

        {/* Step 4 — result */}
        {step === 4 && commitMut.data && (
          <Card header={<span>Import complete</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Created', value: commitMut.data.created.length, color: 'var(--green)' },
                { label: 'Skipped', value: commitMut.data.skipped.length, color: 'var(--text-dim)' },
                { label: 'Failed',  value: commitMut.data.failed.length,  color: 'var(--red)' },
              ].map(c => (
                <div key={c.label} style={{ textAlign: 'center', padding: 16, background: 'var(--surface-2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.label}</div>
                </div>
              ))}
            </div>
            {commitMut.data.failed.length > 0 && (
              <div style={{ marginBottom: 12, fontSize: 11 }}>
                {commitMut.data.failed.map(f => (
                  <div key={f.domain} style={{ color: 'var(--red)' }}>✗ {f.domain}: {f.error}</div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/routes"><Button variant="primary">View routes →</Button></Link>
              <Link href="/import/history"><Button variant="ghost">Import history</Button></Link>
            </div>
          </Card>
        )}

        {/* Navigation */}
        {step < 4 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <Button variant="ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>← Back</Button>
            {step === 1 && (
              <Button variant="primary" onClick={onPreview} disabled={!canAdvance() || previewMut.isPending}>
                {previewMut.isPending ? 'Parsing…' : 'Parse & Preview →'}
              </Button>
            )}
            {(step === 0 || step === 2) && (
              <Button variant="primary" onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}>Next →</Button>
            )}
            {step === 3 && (
              <Button variant="primary" onClick={onCommit} disabled={selected.size === 0 || commitMut.isPending}>
                {commitMut.isPending ? 'Importing…' : `Import ${selected.size} routes →`}
              </Button>
            )}
          </div>
        )}
      </PageContent>
    </>
  )
}
