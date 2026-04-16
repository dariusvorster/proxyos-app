'use client'

import { useState, type FormEvent } from 'react'
import { Badge, Button, Card, Input, Select } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

type DnsType = 'cloudflare' | 'route53' | 'porkbun' | 'digitalocean' | 'godaddy'

const credFields: Record<DnsType, string[]> = {
  cloudflare: ['api_token'],
  route53: ['access_key_id', 'secret_access_key', 'region'],
  porkbun: ['api_key', 'api_secret'],
  digitalocean: ['auth_token'],
  godaddy: ['api_token', 'api_secret'],
}

export default function DnsPage() {
  const utils = trpc.useUtils()
  const list = trpc.dns.list.useQuery()
  const create = trpc.dns.create.useMutation({
    onSuccess: () => { utils.dns.list.invalidate(); setName(''); setCreds({}); setError(null) },
    onError: (e) => setError(e.message),
  })
  const del = trpc.dns.delete.useMutation({ onSuccess: () => utils.dns.list.invalidate() })

  const [name, setName] = useState('')
  const [type, setType] = useState<DnsType>('cloudflare')
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    create.mutate({ name, type, credentials: creds })
  }

  return (
    <>
      <Topbar title="DNS Providers" />
      <PageContent>
        <Card header={<span>Add provider</span>}>
          <form onSubmit={onSubmit} style={{ padding: '12px 13px', display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 8 }}>
              <Input placeholder="name (cloudflare-main)" value={name} onChange={(e) => setName(e.target.value)} required />
              <Select value={type} onChange={(e) => { setType(e.target.value as DnsType); setCreds({}) }}>
                <option value="cloudflare">Cloudflare</option>
                <option value="route53">Route53</option>
                <option value="porkbun">Porkbun</option>
                <option value="digitalocean">DigitalOcean</option>
                <option value="godaddy">GoDaddy</option>
              </Select>
            </div>
            {credFields[type].map((f) => (
              <Input
                key={f}
                placeholder={f}
                value={creds[f] ?? ''}
                onChange={(e) => setCreds({ ...creds, [f]: e.target.value })}
                type={f.includes('secret') || f.includes('token') || f.includes('key') ? 'password' : 'text'}
                required
              />
            ))}
            <Button type="submit" variant="primary" disabled={create.isPending} style={{ justifySelf: 'start' }}>
              {create.isPending ? 'Adding…' : 'Add'}
            </Button>
          </form>
          {error && <div style={{ padding: '0 13px 12px', color: 'var(--red)', fontSize: 11 }}>{error}</div>}
        </Card>

        <Card header={<span>Providers</span>}>
          {list.data?.length === 0 && <div style={{ padding: '16px 13px', color: 'var(--text-dim)', fontSize: 11 }}>None yet.</div>}
          {list.data?.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderTop: '0.5px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{p.name} <Badge tone="purple">{p.type}</Badge></div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {Object.entries(p.credentials).map(([k, v]) => `${k}=${v}`).join(' · ')}
                </div>
              </div>
              <Button size="sm" variant="danger" onClick={() => del.mutate({ id: p.id })}>Remove</Button>
            </div>
          ))}
        </Card>
      </PageContent>
    </>
  )
}
