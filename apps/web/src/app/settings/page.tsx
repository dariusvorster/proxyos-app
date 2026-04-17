'use client'

import Link from 'next/link'
import { useState, useEffect, type ReactNode } from 'react'
import { Badge, Button, Card, Checkbox, Input, Select, Toggle } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

type Section = 'general' | 'alerts' | 'sso' | 'dns' | 'integrations' | 'apikeys' | 'users' | 'tracing' | 'templates' | 'export' | 'danger' | 'profile' | 'http'

const sections: { id: Section; label: string }[] = [
  { id: 'profile', label: 'My profile' },
  { id: 'general', label: 'General' },
  { id: 'http', label: 'HTTP behaviour' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'sso', label: 'SSO Providers' },
  { id: 'dns', label: 'DNS Providers' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'apikeys', label: 'API Keys' },
  { id: 'users', label: 'Users & roles' },
  { id: 'tracing', label: 'Observability' },
  { id: 'templates', label: 'Route templates' },
  { id: 'export', label: 'Export' },
  { id: 'danger', label: 'Danger zone' },
]

export default function SettingsPage() {
  const [active, setActive] = useState<Section>('general')
  return (
    <>
      <Topbar title="Settings" />
      <PageContent>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 0, alignSelf: 'start' }}>
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  background: active === s.id ? 'rgba(124,111,240,0.15)' : 'transparent',
                  color: active === s.id ? 'var(--text-primary)' : 'var(--text-dim)',
                  border: 0,
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  fontWeight: active === s.id ? 500 : 400,
                }}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div style={{ display: 'grid', gap: 14 }}>
            {active === 'profile' && <ProfileSection />}
            {active === 'general' && <GeneralSection />}
            {active === 'http' && <HttpBehaviourSection />}
            {active === 'alerts' && <AlertsSection />}
            {active === 'sso' && <SSOSection />}
            {active === 'dns' && <DNSSection />}
            {active === 'integrations' && <IntegrationsSection />}
            {active === 'apikeys' && <ApiKeysSection />}
            {active === 'users' && <UsersSection />}
            {active === 'tracing' && <TracingSection />}
            {active === 'templates' && <TemplatesSection />}
            {active === 'export' && <ExportSection />}
            {active === 'danger' && <DangerSection />}
          </div>
        </div>
      </PageContent>
    </>
  )
}

function SectionCard({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <Card header={<span>{title}</span>}>
      <div style={{ padding: '2px 0' }}>
        {desc && <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>{desc}</p>}
        {children}
      </div>
    </Card>
  )
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>{hint}</span>}
    </label>
  )
}

function ProfileSection() {
  return (
    <SectionCard title="My profile" desc="Avatar, display name, and password.">
      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
        Change your display name, avatar colour, and password from your profile page.
      </p>
      <Link href="/settings/profile"><Button variant="primary">Open profile →</Button></Link>
    </SectionCard>
  )
}

function GeneralSection() {
  const [name, setName] = useState('ProxyOS')
  const [baseDomain, setBaseDomain] = useState('')
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  return (
    <SectionCard title="General" desc="Instance identity and defaults.">
      <Field label="Instance name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Base domain hint" hint="Used by the scanner for subdomain suggestions."><Input value={baseDomain} onChange={(e) => setBaseDomain(e.target.value)} placeholder="example.com" /></Field>
      <Field label="Timezone"><Input value={tz} onChange={(e) => setTz(e.target.value)} /></Field>
      <Button variant="primary" disabled>Save</Button>
      <p style={{ fontSize: 10, color: 'var(--text-ghost)', marginTop: 8 }}>Settings persistence not wired in V1.</p>
    </SectionCard>
  )
}

function AlertsSection() {
  const [smtp, setSmtp] = useState({ host: '', port: '587', secure: false, user: '', pass: '', from: '', to: '' })
  const [webhook, setWebhook] = useState('')
  const [smtpMsg, setSmtpMsg] = useState('')
  const [webhookMsg, setWebhookMsg] = useState('')

  const config = trpc.alerts.getNotifyConfig.useQuery()
  const saveSmtp = trpc.alerts.setSmtpConfig.useMutation()
  const saveWebhook = trpc.alerts.setWebhookConfig.useMutation()
  const testSmtp = trpc.alerts.testSmtp.useMutation()
  const testWebhookMut = trpc.alerts.testWebhook.useMutation()

  // Populate fields when config loads
  useEffect(() => {
    if (config.data?.smtp) {
      const s = config.data.smtp
      setSmtp({ host: s.host, port: String(s.port), secure: s.secure, user: s.user, pass: s.pass, from: s.from, to: s.to })
    }
    if (config.data?.webhookUrl) setWebhook(config.data.webhookUrl)
  }, [config.data])

  return (
    <>
      <SectionCard title="Email (SMTP)" desc="SMTP config for alert emails.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
          <Field label="Host"><Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.example.com" /></Field>
          <Field label="Port"><Input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="User"><Input value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} /></Field>
          <Field label="Password"><Input type="password" value={smtp.pass} onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })} /></Field>
        </div>
        <Field label="From address"><Input value={smtp.from} onChange={(e) => setSmtp({ ...smtp, from: e.target.value })} placeholder="alerts@example.com" /></Field>
        <Field label="To address(es)"><Input value={smtp.to} onChange={(e) => setSmtp({ ...smtp, to: e.target.value })} placeholder="you@example.com, team@example.com" /></Field>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Toggle checked={smtp.secure} onChange={(v) => setSmtp({ ...smtp, secure: v })} />
          <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-sans)' }}>Use TLS (port 465)</span>
        </div>
        {smtpMsg && <p style={{ fontSize: 11, color: smtpMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--font-sans)', margin: 0 }}>{smtpMsg}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="primary"
            disabled={saveSmtp.isPending}
            onClick={() => {
              saveSmtp.mutate(
                { host: smtp.host, port: Number(smtp.port), secure: smtp.secure, user: smtp.user, pass: smtp.pass, from: smtp.from, to: smtp.to },
                { onSuccess: () => setSmtpMsg('Saved'), onError: (e) => setSmtpMsg(`Error: ${e.message}`) },
              )
            }}
          >Save</Button>
          <Button
            disabled={testSmtp.isPending || !smtp.host || !smtp.to}
            onClick={() => {
              testSmtp.mutate(
                { host: smtp.host, port: Number(smtp.port), secure: smtp.secure, user: smtp.user, pass: smtp.pass, from: smtp.from, to: smtp.to },
                { onSuccess: () => setSmtpMsg('Test email sent'), onError: (e) => setSmtpMsg(`Error: ${e.message}`) },
              )
            }}
          >Send test email</Button>
        </div>
      </SectionCard>

      <SectionCard title="Webhook" desc="Send alert payloads to any HTTP endpoint.">
        <Field label="URL"><Input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://hooks.example.com/alert" /></Field>
        {webhookMsg && <p style={{ fontSize: 11, color: webhookMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--font-sans)', margin: 0 }}>{webhookMsg}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="primary"
            disabled={saveWebhook.isPending}
            onClick={() => {
              saveWebhook.mutate(
                { url: webhook },
                { onSuccess: () => setWebhookMsg('Saved'), onError: (e) => setWebhookMsg(`Error: ${e.message}`) },
              )
            }}
          >Save</Button>
          <Button
            disabled={testWebhookMut.isPending || !webhook}
            onClick={() => {
              testWebhookMut.mutate(
                { url: webhook },
                { onSuccess: () => setWebhookMsg('Test sent'), onError: (e) => setWebhookMsg(`Error: ${e.message}`) },
              )
            }}
          >Send test</Button>
        </div>
      </SectionCard>

      <SectionCard title="Thresholds" desc="Defaults applied to new alert rules.">
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>Configure per-rule thresholds when creating or editing alert rules.</div>
        <div style={{ marginTop: 8 }}>
          <Link href="/alerts" style={{ fontSize: 11, color: 'var(--pu-400)' }}>→ Manage alert rules</Link>
        </div>
      </SectionCard>
    </>
  )
}

function SSOSection() {
  const list = trpc.sso.list.useQuery()
  return (
    <SectionCard title="SSO Providers" desc="Configure forward-auth for Authentik, Authelia, Keycloak, or Zitadel.">
      {list.data?.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>None configured.</p>}
      {list.data?.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '0.5px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 12 }}>{p.name} <Badge tone="purple">{p.type}</Badge></div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{p.forwardAuthUrl}</div>
          </div>
          <Badge tone={p.testStatus === 'ok' ? 'green' : p.testStatus === 'error' ? 'red' : 'neutral'}>{p.testStatus}</Badge>
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        <Link href="/sso"><Button variant="primary">Manage providers →</Button></Link>
      </div>
    </SectionCard>
  )
}

function DNSSection() {
  const list = trpc.dns.list.useQuery()
  return (
    <SectionCard title="DNS Providers" desc="Required for DNS-01 ACME challenges (wildcard / private domains).">
      {list.data?.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>None configured.</p>}
      {list.data?.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '0.5px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 12 }}>{p.name} <Badge tone="purple">{p.type}</Badge></div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{Object.keys(p.credentials).join(', ')}</div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        <Link href="/dns"><Button variant="primary">Manage providers →</Button></Link>
      </div>
    </SectionCard>
  )
}

function IntegrationsSection() {
  return (
    <SectionCard title="Homelab OS integrations" desc="Connect InfraOS, LockBoxOS, PatchOS, BackupOS, and MxWatch.">
      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
        Configure bidirectional integrations with the rest of your homelab OS stack.
      </p>
      <Link href="/settings/integrations"><Button variant="primary">Manage integrations →</Button></Link>
    </SectionCard>
  )
}

function ApiKeysSection() {
  return (
    <SectionCard title="API keys" desc="Machine-to-machine API keys for ProxyOS REST and tRPC access.">
      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
        Create and revoke API keys, set per-key scopes, and view last-used timestamps.
      </p>
      <Link href="/settings/api-keys"><Button variant="primary">Manage API keys →</Button></Link>
    </SectionCard>
  )
}

function UsersSection() {
  return (
    <SectionCard title="Users & roles" desc="Local users, SSO provisioning, and role assignment (admin / operator / viewer).">
      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
        Add users, assign roles, configure dashboard SSO, and remove access.
      </p>
      <Link href="/settings/users"><Button variant="primary">Manage users →</Button></Link>
    </SectionCard>
  )
}

function TracingSection() {
  return (
    <SectionCard title="Observability" desc="Prometheus metrics endpoint and distributed tracing (OpenTelemetry / Jaeger).">
      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
        Configure the <code style={{ fontFamily: 'var(--font-mono)' }}>/api/metrics</code> scrape target, OTLP exporter, and sampling rate.
      </p>
      <Link href="/settings/tracing"><Button variant="primary">Configure tracing →</Button></Link>
    </SectionCard>
  )
}

function TemplatesSection() {
  return (
    <SectionCard title="Route templates" desc="Reusable route blueprints — apply a template to pre-fill headers, middleware, and upstream settings.">
      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
        Manage built-in and custom templates used when creating routes.
      </p>
      <Link href="/settings/templates"><Button variant="primary">Manage templates →</Button></Link>
    </SectionCard>
  )
}

function ExportSection() {
  return (
    <SectionCard title="Export" desc="Portable dumps of your routes for backup or migration.">
      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
        Export your routes as ProxyOS JSON, Caddyfile, Nginx config, or Traefik labels. Preview before downloading.
      </p>
      <Link href="/settings/export"><Button variant="primary">Open export →</Button></Link>
    </SectionCard>
  )
}

function DangerSection() {
  const [confirm, setConfirm] = useState('')
  return (
    <>
      <SectionCard title="Reset Caddy config" desc="Rebuilds Caddy's running config from the ProxyOS database. Useful if Caddy has drifted.">
        <Button variant="danger" disabled>Reset Caddy config</Button>
      </SectionCard>
      <SectionCard title="Wipe all routes" desc="Deletes every route + its Caddy entry. Cannot be undone.">
        <Field label="Type DELETE to confirm">
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
        </Field>
        <Button variant="danger" disabled={confirm !== 'DELETE'}>Wipe routes</Button>
      </SectionCard>
      <SectionCard title="Factory reset" desc="Wipes routes, SSO, DNS, alerts, audit, Caddy state. Container restart required.">
        <Button variant="danger" disabled>Factory reset</Button>
      </SectionCard>
    </>
  )
}

function HttpBehaviourSection() {
  const utils = trpc.useUtils()
  const query = trpc.system.getForceHttps.useQuery()
  const mut = trpc.system.setForceHttps.useMutation({ onSuccess: () => utils.system.getForceHttps.invalidate() })
  const enabled = query.data?.enabled ?? false

  return (
    <SectionCard title="HTTP behaviour" desc="Controls how ProxyOS handles plain HTTP traffic on port 80.">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Force HTTPS</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 380 }}>
            Redirect all HTTP traffic (port 80) to HTTPS automatically. Recommended for all installations.
          </div>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => mut.mutate({ enabled: v })}
        />
      </div>
    </SectionCard>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}
void ToggleRow
