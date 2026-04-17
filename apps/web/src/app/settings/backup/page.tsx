'use client'

import { useState, useRef } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Button, Card } from '~/components/ui'
import { trpc } from '~/lib/trpc'

export default function BackupPage() {
  const exportQuery = trpc.backupConfig.export.useQuery(undefined, { enabled: false })
  const dryRunQuery = trpc.backupConfig.importDryRun.useQuery(
    { data: '' },
    { enabled: false },
  )
  const applyMut = trpc.backupConfig.importApply.useMutation()

  const [importJson, setImportJson] = useState('')
  const [dryRunResult, setDryRunResult] = useState<Awaited<ReturnType<typeof dryRunQuery.refetch>>['data'] | null>(null)
  const [dryRunError, setDryRunError] = useState('')
  const [applyMsg, setApplyMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const utils = trpc.useUtils()

  function download() {
    utils.backupConfig.export.fetch().then(data => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href = url; a.download = `proxyos-backup-${date}.json`; a.click()
      URL.revokeObjectURL(url)
    })
  }

  function handleFileLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setImportJson(ev.target?.result as string ?? '')
      setDryRunResult(null)
      setDryRunError('')
      setApplyMsg('')
    }
    reader.readAsText(file)
  }

  async function runDryRun() {
    setDryRunError('')
    setDryRunResult(null)
    try {
      const result = await utils.backupConfig.importDryRun.fetch({ data: importJson })
      setDryRunResult(result)
    } catch (e) {
      setDryRunError((e as Error).message)
    }
  }

  return (
    <>
      <Topbar title="Backup & restore" />
      <PageContent>
        <PageHeader
          title="Backup & restore"
          desc="Export the full ProxyOS configuration as a portable JSON file. Import a backup to restore routes, SSO providers, DNS providers, alert rules, and templates."
        />

        <Card header={<span>Export full config</span>} style={{ marginBottom: 16 }}>
          <div style={{ padding: '4px 0 10px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            Downloads a JSON file containing all routes, SSO providers, DNS providers, API keys (hashed), alert rules, and templates.
            Analytics data is excluded — it regenerates automatically.
          </div>
          <Button variant="primary" onClick={download}>
            Download backup
          </Button>
        </Card>

        <Card header={<span>Import config</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
              Paste a ProxyOS backup JSON or upload a file. Run dry-run to preview changes before applying.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" style={{ fontSize: 11 }} onClick={() => fileRef.current?.click()}>
                Upload file
              </Button>
              <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileLoad} />
            </div>

            <textarea
              value={importJson}
              onChange={e => { setImportJson(e.target.value); setDryRunResult(null); setApplyMsg('') }}
              placeholder='{"proxyos_export_version": 1, ...}'
              rows={8}
              style={{
                width: '100%', fontFamily: 'var(--font-mono)', fontSize: 11,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 4, color: 'var(--text)', padding: '8px',
                resize: 'vertical', boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" onClick={runDryRun} disabled={!importJson.trim()}>
                Dry run (preview)
              </Button>
              {dryRunResult && (
                <Button variant="primary"
                  onClick={() => {
                    applyMut.mutate({ data: importJson }, {
                      onSuccess: r => setApplyMsg(`Applied: ${r.imported} items imported, ${r.skipped} skipped.`),
                      onError: e => setApplyMsg(`Error: ${e.message}`),
                    })
                  }}
                  disabled={applyMut.isPending}>
                  {applyMut.isPending ? 'Applying…' : 'Apply import'}
                </Button>
              )}
            </div>

            {dryRunError && (
              <div style={{ fontSize: 11, color: 'var(--red)' }}>{dryRunError}</div>
            )}

            {dryRunResult && (
              <div style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '12px 14px', fontSize: 12,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>
                  Dry run — export version {dryRunResult.version}, exported {dryRunResult.exportedAt ? new Date(dryRunResult.exportedAt).toLocaleString() : '—'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 16px', fontSize: 11 }}>
                  <DiffLine label="Routes to add" value={dryRunResult.routes.add} tone="green" />
                  <DiffLine label="Routes to update" value={dryRunResult.routes.update} tone="amber" />
                  <DiffLine label="Routes to remove" value={dryRunResult.routes.remove} tone="red" />
                  <DiffLine label="SSO providers to add" value={dryRunResult.ssoProviders.add} tone="green" />
                  <DiffLine label="SSO providers to update" value={dryRunResult.ssoProviders.update} tone="amber" />
                  <DiffLine label="DNS providers" value={dryRunResult.dnsProviders.add} tone="green" />
                </div>
                {dryRunResult.preview.routesToAdd.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11 }}>
                    <span style={{ color: 'var(--text2)' }}>Domains to add: </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
                      {dryRunResult.preview.routesToAdd.join(', ')}
                    </span>
                  </div>
                )}
                {dryRunResult.preview.routesToRemove.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11 }}>
                    <span style={{ color: 'var(--text2)' }}>Domains to remove: </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                      {dryRunResult.preview.routesToRemove.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            )}

            {applyMsg && (
              <div style={{ fontSize: 11, color: applyMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
                {applyMsg}
              </div>
            )}
          </div>
        </Card>
      </PageContent>
    </>
  )
}

function DiffLine({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'red' }) {
  const colors = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)' }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ fontWeight: 600, color: value > 0 ? colors[tone] : 'var(--text3)', minWidth: 20 }}>{value}</span>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
    </div>
  )
}
