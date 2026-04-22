'use client'

import { useState } from 'react'
import { AlertBanner, Badge, Button, Card, Dot, Input, Select } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

const HIGH_RISK_LABEL = 'CN, RU, KP, IR, BY, SY, CU, VE'

export default function SecurityPage() {
  const [handleError] = useErrorHandler()
  const utils = trpc.useUtils()

  const bans = trpc.security.listBans.useQuery({ includeExpired: false })
  const rules = trpc.security.listFail2banRules.useQuery()
  const presets = trpc.security.getPresets.useQuery()

  const unban = trpc.security.unbanIP.useMutation({ onSuccess: () => utils.security.listBans.invalidate(), onError: handleError })
  const deleteRule = trpc.security.deleteFail2banRule.useMutation({ onSuccess: () => utils.security.listFail2banRules.invalidate(), onError: handleError })
  const toggleRule = trpc.security.toggleFail2banRule.useMutation({ onSuccess: () => utils.security.listFail2banRules.invalidate(), onError: handleError })
  const addPreset = trpc.security.createFail2banRule.useMutation({ onSuccess: () => utils.security.listFail2banRules.invalidate(), onError: handleError })
  const purge = trpc.security.purgeExpiredBans.useMutation({ onSuccess: () => utils.security.listBans.invalidate(), onError: handleError })

  const banIP = trpc.security.banIP.useMutation({ onSuccess: () => { utils.security.listBans.invalidate(); setManualIp(''); setManualReason('') }, onError: handleError })

  const [manualIp, setManualIp] = useState('')
  const [manualReason, setManualReason] = useState('')
  const [manualDuration, setManualDuration] = useState('3600')
  const [tab, setTab] = useState<'bans' | 'rules' | 'geoip'>('bans')

  return (
    <>
      <Topbar title="Security" />
      <PageContent>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {(['bans', 'rules', 'geoip'] as const).map(t => (
            <Button key={t} variant={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)}>
              {t === 'bans' ? `IP bans${bans.data?.length ? ` (${bans.data.length})` : ''}` : t === 'rules' ? 'Fail2ban rules' : 'GeoIP'}
            </Button>
          ))}
        </div>

        {/* IP Bans */}
        {tab === 'bans' && (
          <>
            <Card header={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span>Active IP bans</span>
                <Button variant="ghost" style={{ fontSize: 10 }} onClick={() => purge.mutate()} disabled={purge.isPending}>Purge expired</Button>
              </div>
            }>
              {/* Manual ban form */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 80px auto', gap: 8, marginBottom: 12, alignItems: 'end' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 3 }}>IP</div>
                  <Input value={manualIp} onChange={e => setManualIp(e.target.value)} placeholder="1.2.3.4" />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 3 }}>Reason</div>
                  <Input value={manualReason} onChange={e => setManualReason(e.target.value)} placeholder="manual ban" />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 3 }}>Duration</div>
                  <Select value={manualDuration} onChange={e => setManualDuration(e.target.value)}>
                    <option value="3600">1 hour</option>
                    <option value="86400">24 hours</option>
                    <option value="604800">7 days</option>
                    <option value="0">Permanent</option>
                  </Select>
                </div>
                <div />
                <Button variant="primary" onClick={() => banIP.mutate({ ip: manualIp, reason: manualReason, banDurationSeconds: Number(manualDuration) || undefined })} disabled={!manualIp || banIP.isPending}>
                  Ban
                </Button>
              </div>

              {bans.data?.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No active bans.</div>}
              {bans.data && bans.data.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                      {['IP', 'Reason', 'Rule', 'Banned at', 'Expires', ''].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 400 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bans.data.map(ban => (
                      <tr key={ban.ip} style={{ borderBottom: '0.5px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)' }}>{ban.ip}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{ban.reason}</td>
                        <td style={{ padding: '6px 8px' }}>{ban.ruleName ? <Badge tone="amber">{ban.ruleName}</Badge> : <span style={{ color: 'var(--text-ghost)' }}>manual</span>}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-dim)', fontSize: 11 }}>{ban.bannedAt ? new Date(ban.bannedAt).toLocaleString() : '—'}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-dim)', fontSize: 11 }}>
                          {ban.permanent ? <Badge tone="red">permanent</Badge> : ban.expiresAt ? new Date(ban.expiresAt).toLocaleString() : '—'}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <Button variant="ghost" style={{ fontSize: 10 }} onClick={() => unban.mutate({ ip: ban.ip })} disabled={unban.isPending}>Unban</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}

        {/* Fail2ban rules */}
        {tab === 'rules' && (
          <>
            <Card header={<span>Fail2ban rules</span>} style={{ marginBottom: 8 }}>
              {rules.data?.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No rules configured.</div>}
              {rules.data && rules.data.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                      {['', 'Name', 'Hits', ''].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 400 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rules.data.map(r => {
                      const cfg = parseRuleSafe(r.config)
                      return (
                        <tr key={r.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px' }}><Dot tone={r.enabled ? 'green' : 'neutral'} /></td>
                          <td style={{ padding: '6px 8px' }}>
                            <div style={{ fontWeight: 500 }}>{r.name}</div>
                            {cfg && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{cfg.threshold} hits / {cfg.windowSeconds}s → ban {cfg.banDurationSeconds}s</div>}
                          </td>
                          <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', color: 'var(--pu-400)' }}>{r.hitCount}</td>
                          <td style={{ padding: '6px 8px', display: 'flex', gap: 4 }}>
                            <Button variant="ghost" style={{ fontSize: 10 }} onClick={() => toggleRule.mutate({ id: r.id, enabled: !r.enabled })}>
                              {r.enabled ? 'Disable' : 'Enable'}
                            </Button>
                            <Button variant="ghost" style={{ fontSize: 10, color: 'var(--red)' }} onClick={() => deleteRule.mutate({ id: r.id })}>Delete</Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Card>

            <Card header={<span>Add preset rule</span>}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {presets.data?.map((p, i) => (
                  <div key={i} style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--surface-2)', border: '0.5px solid var(--border)' }}>
                    <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>
                      {p.threshold} hits / {p.windowSeconds}s → {p.banDurationSeconds / 3600}h ban
                    </div>
                    <Button variant="primary" style={{ fontSize: 10, padding: '3px 10px' }}
                      onClick={() => addPreset.mutate(p)}
                      disabled={addPreset.isPending}>
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* GeoIP */}
        {tab === 'geoip' && (
          <Card header={<span>GeoIP blocking</span>}>
            <AlertBanner tone="amber">
              GeoIP blocking requires Caddy compiled with the MaxMind GeoIP module. Configure per-route in the route detail page.
            </AlertBanner>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>High-risk country preset</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 6, border: '0.5px solid var(--border)' }}>
                {HIGH_RISK_LABEL}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                Use in the expose wizard or route security settings to block high-risk regions.
              </div>
            </div>
          </Card>
        )}
      </PageContent>
    </>
  )
}

function parseRuleSafe(json: string): { threshold: number; windowSeconds: number; banDurationSeconds: number } | null {
  try { return JSON.parse(json) as { threshold: number; windowSeconds: number; banDurationSeconds: number } } catch { return null }
}
