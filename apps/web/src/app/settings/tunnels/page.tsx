'use client'

import { useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card, DataTable, Dot, td, th } from '~/components/ui'
import { trpc } from '~/lib/trpc'

type ProviderType = 'cloudflare' | 'tailscale' | 'ngrok'
type WizardStep = 'type' | 'creds' | 'test'

const PROVIDER_DESCRIPTIONS: Record<ProviderType, string> = {
  cloudflare: 'Zero-Trust tunnels via Cloudflare. No port forwarding. Free tier includes unlimited tunnels.',
  tailscale: 'Tailscale Funnel — expose services on your tailnet to the internet. Requires ACL policy update.',
  ngrok: 'ngrok reverse tunnels. Free tier: 1 tunnel, random subdomain. Pro: reserved domains, more tunnels.',
}

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 12,
  boxSizing: 'border-box' as const,
}

const labelStyle = { fontSize: 11, color: 'var(--text2)', marginBottom: 4 }

function CredField({ k, label, value, onChange, type = 'text' }: {
  k: string; label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </div>
  )
}

function processStatusDot(status: string | null | undefined): 'green' | 'amber' | 'red' | 'neutral' {
  switch (status) {
    case 'running': return 'green'
    case 'starting': return 'amber'
    case 'crashed': return 'red'
    case 'stopped': return 'neutral'
    default: return 'neutral'
  }
}

function TailscaleAclNotice() {
  const [open, setOpen] = useState(false)
  const json = JSON.stringify({ nodeAttrs: [{ target: ['tag:funnel-enabled'], attr: ['funnel'] }] }, null, 2)
  return (
    <div style={{ padding: '10px 12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--amber)' }}>Tailscale ACL policy required</span>
        <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text2)' }}>
          {open ? 'Hide' : 'Show ACL JSON'}
        </button>
      </div>
      {open && (
        <pre style={{ marginTop: 8, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 4, fontSize: 10, overflowX: 'auto', color: 'var(--text)' }}>
          {json}
        </pre>
      )}
      <div style={{ marginTop: 4, color: 'var(--text2)' }}>
        Add the above to your tailnet ACL policy at admin.tailscale.com → Access controls. Funnel requires the <code>funnel</code> attribute on <code>tag:funnel-enabled</code>.
      </div>
    </div>
  )
}

function NgrokFreeTierWarning() {
  return (
    <div style={{ padding: '10px 12px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, fontSize: 11, color: 'var(--text2)' }}>
      <strong style={{ color: 'var(--text)' }}>ngrok free tier limits:</strong> 1 concurrent tunnel, random subdomain regenerated on restart.
      Upgrade to ngrok Pro for reserved domains and multiple simultaneous tunnels.
    </div>
  )
}

function LogsViewer({ providerId }: { providerId: string }) {
  const logs = trpc.tunnels.providers.logs.useQuery({ id: providerId, lines: 100 }, { refetchInterval: 5_000 })
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'auto', maxHeight: 200, padding: '8px 10px' }}>
      {logs.data?.length === 0 && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>No logs.</span>}
      {logs.data?.map((line: string, i: number) => (
        <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', lineHeight: 1.5 }}>{line}</div>
      ))}
    </div>
  )
}

function ProviderRow({ provider, onDelete, onTest, onRestart }: {
  provider: { id: string; name: string; type: ProviderType; status: string; processStatus: string | null; processRestartCount: number; lastHealthStatus: string | null; lastTestedAt: Date | null }
  onDelete: () => void; onTest: () => void; onRestart: () => void
}) {
  const [showLogs, setShowLogs] = useState(false)
  const restartMut = trpc.tunnels.providers.restart.useMutation({ onSuccess: onRestart })
  const testMut = trpc.tunnels.providers.test.useMutation({ onSuccess: onTest })
  const deleteMut = trpc.tunnels.providers.delete.useMutation({ onSuccess: onDelete })

  return (
    <>
      <tr>
        <td style={{ ...td, fontWeight: 500 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Dot tone={processStatusDot(provider.processStatus)} />
            {provider.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
            {provider.processRestartCount > 0 && `${provider.processRestartCount} restart${provider.processRestartCount !== 1 ? 's' : ''}`}
          </div>
        </td>
        <td style={td}><Badge tone="neutral">{provider.type}</Badge></td>
        <td style={td}>
          <Badge tone={provider.status === 'connected' ? 'green' : provider.status === 'error' ? 'red' : 'neutral'}>
            {provider.processStatus ?? provider.status}
          </Badge>
        </td>
        <td style={{ ...td, fontSize: 10, color: 'var(--text2)' }}>
          {provider.lastTestedAt ? new Date(provider.lastTestedAt).toLocaleString() : '—'}
        </td>
        <td style={td}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setShowLogs(!showLogs)}>
              {showLogs ? 'Hide logs' : 'Logs'}
            </Button>
            <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => testMut.mutate({ id: provider.id })} disabled={testMut.isPending}>Test</Button>
            <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => restartMut.mutate({ id: provider.id })} disabled={restartMut.isPending}>Restart</Button>
            <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)' }}
              onClick={() => { if (confirm(`Delete ${provider.name}?`)) deleteMut.mutate({ id: provider.id }) }}>
              Delete
            </Button>
          </div>
        </td>
      </tr>
      {showLogs && (
        <tr>
          <td colSpan={5} style={{ ...td, background: 'var(--surface2)' }}>
            <LogsViewer providerId={provider.id} />
          </td>
        </tr>
      )}
    </>
  )
}

function AddWizard({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<WizardStep>('type')
  const [type, setType] = useState<ProviderType>('cloudflare')
  const [name, setName] = useState('')
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; details?: string } | null>(null)

  const createMut = trpc.tunnels.providers.create.useMutation({ onSuccess: onDone })
  const testMut = trpc.tunnels.providers.test.useMutation()

  function setCred(k: string, v: string) { setCreds(prev => ({ ...prev, [k]: v })) }

  async function runTest() {
    setTestResult(null)
    const result = await createMut.mutateAsync({ type, name: name || `${type}-provider`, credentials: creds })
    if (result.id) {
      const r = await testMut.mutateAsync({ id: result.id })
      setTestResult(r)
    }
  }

  if (step === 'type') {
    return (
      <Card header={<span>Add tunnel provider — Step 1 of 3: Choose type</span>}>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          {(['cloudflare', 'tailscale', 'ngrok'] as ProviderType[]).map(t => (
            <button key={t} onClick={() => setType(t)} style={{
              padding: '12px 16px', borderRadius: 6, border: `2px solid ${type === t ? 'var(--purple)' : 'var(--border)'}`,
              background: type === t ? 'rgba(124,111,240,0.08)' : 'var(--surface2)', cursor: 'pointer',
              textAlign: 'left', display: 'grid', gap: 4
            }}>
              <span style={{ fontWeight: 500, color: 'var(--text)', textTransform: 'capitalize' }}>{t === 'cloudflare' ? 'Cloudflare Tunnel' : t === 'tailscale' ? 'Tailscale Funnel' : 'ngrok'}</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{PROVIDER_DESCRIPTIONS[t]}</span>
            </button>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Button variant="primary" onClick={() => setStep('creds')}>Next →</Button>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      </Card>
    )
  }

  if (step === 'creds') {
    return (
      <Card header={<span>Add tunnel provider — Step 2 of 3: Configure</span>}>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <CredField k="name" label="Provider name" value={name} onChange={v => setName(v)} />
          {type === 'cloudflare' && (
            <>
              <CredField k="accountId" label="Account ID" value={creds.accountId ?? ''} onChange={v => setCred('accountId', v)} />
              <CredField k="apiToken" label="API Token" value={creds.apiToken ?? ''} onChange={v => setCred('apiToken', v)} type="password" />
              <CredField k="tunnelName" label="Tunnel name (created if not exists)" value={creds.tunnelName ?? ''} onChange={v => setCred('tunnelName', v)} />
              <CredField k="zoneId" label="Zone ID (optional)" value={creds.zoneId ?? ''} onChange={v => setCred('zoneId', v)} />
            </>
          )}
          {type === 'tailscale' && (
            <>
              <TailscaleAclNotice />
              <CredField k="authKey" label="Tailscale Auth Key" value={creds.authKey ?? ''} onChange={v => setCred('authKey', v)} type="password" />
            </>
          )}
          {type === 'ngrok' && (
            <>
              <NgrokFreeTierWarning />
              <CredField k="authToken" label="Auth Token" value={creds.authToken ?? ''} onChange={v => setCred('authToken', v)} type="password" />
              <CredField k="region" label="Region (optional, e.g. us, eu, ap)" value={creds.region ?? ''} onChange={v => setCred('region', v)} />
              <CredField k="reservedDomain" label="Reserved domain (optional, Pro only)" value={creds.reservedDomain ?? ''} onChange={v => setCred('reservedDomain', v)} />
            </>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Button variant="ghost" onClick={() => setStep('type')}>← Back</Button>
            <Button variant="primary" onClick={() => setStep('test')} disabled={!name}>Next →</Button>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card header={<span>Add tunnel provider — Step 3 of 3: Test &amp; Save</span>}>
      <div style={{ padding: 16, display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          Ready to add <strong>{name}</strong> ({type}). Click Test to verify credentials before saving, or Save to add without testing.
        </div>
        {testResult && (
          <div style={{ padding: '10px 12px', background: testResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${testResult.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`, borderRadius: 6, fontSize: 11, color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
            {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error ?? 'Connection failed'}`}
            {testResult.details && <div style={{ color: 'var(--text2)', marginTop: 4 }}>{testResult.details}</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => setStep('creds')}>← Back</Button>
          <Button variant="ghost" onClick={runTest} disabled={testMut.isPending || createMut.isPending}>
            {testMut.isPending ? 'Testing…' : 'Test connection'}
          </Button>
          <Button variant="primary" onClick={() => createMut.mutate({ type, name, credentials: creds })} disabled={createMut.isPending}>
            {createMut.isPending ? 'Saving…' : 'Save provider'}
          </Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
        {createMut.isError && <div style={{ fontSize: 11, color: 'var(--red)' }}>{createMut.error.message}</div>}
      </div>
    </Card>
  )
}

export default function TunnelsPage() {
  const providers = trpc.tunnels.providers.list.useQuery(undefined, { refetchInterval: 15_000 })
  const [showWizard, setShowWizard] = useState(false)

  function refresh() { void providers.refetch() }

  return (
    <>
      <Topbar title="Tunnels" actions={<Button variant="primary" onClick={() => setShowWizard(true)}>+ Add tunnel provider</Button>} />
      <PageContent>
        <PageHeader title="Tunnel providers" desc="Expose services via Cloudflare Tunnel, Tailscale Funnel, or ngrok — no port forwarding required." />

        {showWizard && <AddWizard onDone={() => { setShowWizard(false); refresh() }} onCancel={() => setShowWizard(false)} />}

        <Card header={<span>Configured providers</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '30%' }}>Name</th>
                <th style={{ ...th, width: '12%' }}>Type</th>
                <th style={{ ...th, width: '18%' }}>Process</th>
                <th style={{ ...th, width: '20%' }}>Last tested</th>
                <th style={{ ...th, width: '20%' }}></th>
              </tr>
            </thead>
            <tbody>
              {providers.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No tunnel providers configured.</td></tr>
              )}
              {providers.data?.map(p => (
                <ProviderRow
                  key={p.id}
                  provider={p}
                  onDelete={refresh}
                  onTest={refresh}
                  onRestart={refresh}
                />
              ))}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>
    </>
  )
}
