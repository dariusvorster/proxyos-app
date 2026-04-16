'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, Card, Select } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import type { Route } from '@proxyos/types'

type ExportFormat = 'proxyos' | 'caddyfile' | 'nginx' | 'traefik'

function routesToCaddyfile(routes: Route[]): string {
  return routes.filter(r => r.enabled).map(r => {
    const upstream = r.upstreams[0]?.address ?? 'localhost:80'
    return `${r.domain} {
  reverse_proxy ${upstream}
  tls ${r.tlsMode === 'auto' ? 'internal' : r.tlsMode}
  encode gzip zstd
}`
  }).join('\n\n')
}

function routesToNginx(routes: Route[]): string {
  return routes.filter(r => r.enabled).map(r => {
    const upstream = r.upstreams[0]?.address ?? 'localhost:80'
    const ssl = r.tlsMode !== 'off'
    return `server {
  server_name ${r.domain};
  ${ssl ? 'listen 443 ssl;\n  ssl_certificate /etc/ssl/certs/${r.domain}.crt;\n  ssl_certificate_key /etc/ssl/private/${r.domain}.key;' : 'listen 80;'}
  location / {
    proxy_pass http://${upstream};
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}`
  }).join('\n\n')
}

function routesToTraefik(routes: Route[]): string {
  const services: string[] = []
  const routeBlocks: string[] = []
  for (const r of routes.filter(rr => rr.enabled)) {
    const name = r.domain.replace(/\./g, '-')
    const upstream = r.upstreams[0]?.address ?? 'localhost:80'
    routeBlocks.push(`  ${name}:\n    rule: "Host(\`${r.domain}\`)"\n    service: ${name}\n    ${r.tlsMode !== 'off' ? 'tls:\n      certResolver: letsencrypt' : ''}`)
    services.push(`  ${name}:\n    loadBalancer:\n      servers:\n        - url: "http://${upstream}"`)
  }
  return `http:\n  routers:\n${routeBlocks.join('\n')}\n  services:\n${services.join('\n')}`
}

export default function ExportPage() {
  const routesList = trpc.routes.list.useQuery()
  const [format, setFormat] = useState<ExportFormat>('proxyos')
  const [scope, setScope] = useState<'all' | 'enabled'>('enabled')

  const routes = routesList.data ?? []
  const target = scope === 'enabled' ? routes.filter(r => r.enabled) : routes

  function getExportContent(): string {
    switch (format) {
      case 'proxyos':     return JSON.stringify(target, null, 2)
      case 'caddyfile':   return routesToCaddyfile(target)
      case 'nginx':       return routesToNginx(target)
      case 'traefik':     return routesToTraefik(target)
    }
  }

  function download() {
    const ext = format === 'proxyos' ? 'json' : format === 'caddyfile' ? 'caddy' : format === 'nginx' ? 'conf' : 'yml'
    const blob = new Blob([getExportContent()], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `proxyos-export.${ext}`; a.click()
    URL.revokeObjectURL(url)
  }

  const content = getExportContent()

  return (
    <>
      <Topbar title="Export Routes" actions={<Link href="/settings" style={{ fontSize: 11, color: 'var(--accent)' }}>← Settings</Link>} />
      <PageContent>
        <Card header={<span>Export options</span>} style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Format</span>
              <Select value={format} onChange={e => setFormat(e.target.value as ExportFormat)}>
                <option value="proxyos">ProxyOS JSON (re-importable)</option>
                <option value="caddyfile">Caddyfile</option>
                <option value="nginx">Nginx (sites-available)</option>
                <option value="traefik">Traefik (docker-compose labels)</option>
              </Select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Scope</span>
              <Select value={scope} onChange={e => setScope(e.target.value as 'all' | 'enabled')}>
                <option value="enabled">Enabled routes only ({routes.filter(r => r.enabled).length})</option>
                <option value="all">All routes ({routes.length})</option>
              </Select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={download} disabled={target.length === 0}>
              Download ({target.length} routes)
            </Button>
            <Button variant="ghost" onClick={() => navigator.clipboard.writeText(content)}>Copy to clipboard</Button>
          </div>
        </Card>

        <Card header={<span>Preview</span>}>
          <pre style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)',
            background: 'var(--surface-2)', padding: 14, borderRadius: 6,
            overflowX: 'auto', maxHeight: 500, overflowY: 'auto',
            border: '1px solid var(--border)', lineHeight: 1.6,
          }}>
            {target.length === 0
              ? '# No routes to export'
              : content}
          </pre>
        </Card>
      </PageContent>
    </>
  )
}
