'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, Input, Toggle } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function IntegrationsPage() {
  const utils = trpc.useUtils()

  const infraConfig = trpc.integrations.getInfraOSConfig.useQuery()
  const lbConfig = trpc.integrations.getLockBoxConfig.useQuery()
  const patchConfig = trpc.integrations.getPatchOSConfig.useQuery()
  const mailRoutes = trpc.integrations.detectMailRoutes.useQuery()
  const backupReg = trpc.integrations.getBackupOSRegistration.useQuery()
  const agentVersions = trpc.integrations.listAgentVersions.useQuery()

  const setInfra = trpc.integrations.setInfraOSConfig.useMutation({ onSuccess: () => utils.integrations.getInfraOSConfig.invalidate() })
  const setLB = trpc.integrations.setLockBoxConfig.useMutation({ onSuccess: () => utils.integrations.getLockBoxConfig.invalidate() })
  const setPatch = trpc.integrations.setPatchOSConfig.useMutation({ onSuccess: () => utils.integrations.getPatchOSConfig.invalidate() })

  const [infraUrl, setInfraUrl] = useState('')
  const [infraToken, setInfraToken] = useState('')
  const [lbUrl, setLbUrl] = useState('')
  const [lbToken, setLbToken] = useState('')
  const [patchUrl, setPatchUrl] = useState('')
  const [patchToken, setPatchToken] = useState('')
  const [patchAutoRollback, setPatchAutoRollback] = useState(true)

  return (
    <>
      <Topbar
        title="Homelab OS integrations"
        actions={<Link href="/settings" style={{ fontSize: 11, color: 'var(--pu-400)' }}>← Settings</Link>}
      />
      <PageContent>

        {/* InfraOS */}
        <Card header={<span>InfraOS — bidirectional</span>} style={{ marginBottom: 8 }}>
          {infraConfig.data && (
            <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              Connected: <code style={{ fontFamily: 'var(--font-mono)' }}>{infraConfig.data.baseUrl}</code>
              <span style={{ marginLeft: 8 }}><Badge tone="green">bidirectional</Badge></span>
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            <Field label="InfraOS base URL"><Input value={infraUrl} onChange={e => setInfraUrl(e.target.value)} placeholder="https://infra.homelabza.com" /></Field>
            <Field label="API token"><Input type="password" value={infraToken} onChange={e => setInfraToken(e.target.value)} /></Field>
            <Button variant="primary" onClick={() => setInfra.mutate({ baseUrl: infraUrl, token: infraToken, bidirectional: true })} disabled={!infraUrl || !infraToken || setInfra.isPending}>Save</Button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
            InfraOS can trigger route creation via <code style={{ fontFamily: 'var(--font-mono)' }}>ios expose</code>. ProxyOS chain nodes link back to InfraOS container/VM entries.
          </div>
        </Card>

        {/* BackupOS */}
        <Card header={<span>BackupOS — auto-registration</span>} style={{ marginBottom: 8 }}>
          {backupReg.data && (
            <div style={{ display: 'grid', gap: 6 }}>
              {backupReg.data.targets.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t.name}</span>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{t.path}</code>
                </div>
              ))}
              {backupReg.data.webhookUrl && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Webhook: {backupReg.data.webhookUrl}</div>
              )}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
            Set <code style={{ fontFamily: 'var(--font-mono)' }}>BACKUPOS_WEBHOOK_URL</code> env var to enable BackupOS pre/post-migration notifications.
          </div>
        </Card>

        {/* LockBoxOS */}
        <Card header={<span>LockBoxOS — credential vault</span>} style={{ marginBottom: 8 }}>
          {lbConfig.data && (
            <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              Connected: <code style={{ fontFamily: 'var(--font-mono)' }}>{lbConfig.data.baseUrl}</code>
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            <Field label="LockBoxOS base URL"><Input value={lbUrl} onChange={e => setLbUrl(e.target.value)} placeholder="https://lockbox.homelabza.com" /></Field>
            <Field label="API token"><Input type="password" value={lbToken} onChange={e => setLbToken(e.target.value)} /></Field>
            <Button variant="primary" onClick={() => setLB.mutate({ baseUrl: lbUrl, token: lbToken })} disabled={!lbUrl || !lbToken || setLB.isPending}>Save</Button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
            When configured, connection credentials can be sourced from LockBoxOS vault paths instead of the local encrypted DB field.
          </div>
        </Card>

        {/* MxWatch */}
        <Card header={<span>MxWatch — mail infrastructure</span>} style={{ marginBottom: 8 }}>
          {(mailRoutes.data?.length ?? 0) > 0 ? (
            <div>
              <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-secondary)' }}>
                {mailRoutes.data!.length} route{mailRoutes.data!.length !== 1 ? 's' : ''} detected as mail infrastructure:
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                {mailRoutes.data!.map(r => (
                  <div key={r.routeId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <code style={{ fontFamily: 'var(--font-mono)' }}>{r.domain}</code>
                    <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{r.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No mail-related routes detected.</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
            MxWatch monitors DMARC pass rate, blacklist status, and deliverability for mail-serving routes. Deliverability score appears in the route chain view.
          </div>
        </Card>

        {/* PatchOS */}
        <Card header={<span>PatchOS — agent version tracking</span>} style={{ marginBottom: 8 }}>
          {agentVersions.data && agentVersions.data.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {agentVersions.data.map(v => (
                <div key={v.agentId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{v.agentId}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--text-dim)' }}>v{v.version}</span>
                    <Badge tone={v.health === 'ok' ? 'green' : 'red'}>{v.health}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            <Field label="PatchOS base URL"><Input value={patchUrl} onChange={e => setPatchUrl(e.target.value)} placeholder="https://patch.homelabza.com" /></Field>
            <Field label="API token"><Input type="password" value={patchToken} onChange={e => setPatchToken(e.target.value)} /></Field>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12 }}>Auto-rollback on health fail</span>
              <Toggle checked={patchAutoRollback} onChange={setPatchAutoRollback} />
            </div>
            <Button variant="primary" onClick={() => setPatch.mutate({ baseUrl: patchUrl, token: patchToken, enableAutoRollback: patchAutoRollback })} disabled={!patchUrl || !patchToken || setPatch.isPending}>Save</Button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
            PatchOS polls <code style={{ fontFamily: 'var(--font-mono)' }}>/api/health</code> after updates. If health fails, PatchOS triggers auto-rollback to the previous agent version.
          </div>
        </Card>

        {/* Teams — Cloud tier stub */}
        <Card header={<span>Teams & org hierarchy</span>}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Badge tone="amber">Cloud Teams</Badge>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Org → Site → Agent hierarchy, multi-user billing, and site-scoped operator permissions are available on the ProxyOS Cloud Teams plan.
            </div>
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
