#!/usr/bin/env node
/**
 * ProxyOS CLI — proxyos binary
 *
 * Usage examples (see spec §14.4):
 *   proxyos auth login https://proxy.homelabza.com
 *   proxyos expose 192.168.69.25:5678 --domain n8n.homelabza.com --tls auto
 *   proxyos routes list
 *   proxyos routes disable gitbay.homelabza.com
 *   proxyos routes delete gitbay.homelabza.com
 *   proxyos chain gitbay.homelabza.com
 *   proxyos agents list
 *   proxyos connections list
 *   proxyos connections sync cloudflare
 *   proxyos scan --agent homelab-primary
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// ─── Config ──────────────────────────────────────────────────────────────────

const CONFIG_PATH = join(homedir(), '.proxyos', 'config.json')

interface CLIConfig {
  baseUrl: string
  apiKey: string
}

function loadConfig(): CLIConfig | null {
  if (!existsSync(CONFIG_PATH)) return null
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as CLIConfig } catch { return null }
}

function saveConfig(cfg: CLIConfig): void {
  const dir = join(homedir(), '.proxyos')
  try {
    import('node:fs').then(({ mkdirSync }) => mkdirSync(dir, { recursive: true }))
  } catch { /* ignore */ }
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function api(cfg: CLIConfig, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl}/api/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    let msg = text
    try { msg = (JSON.parse(text) as { error: string }).error } catch { /* raw */ }
    throw new Error(`HTTP ${res.status}: ${msg}`)
  }
  if (!text) return {}
  return JSON.parse(text)
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function col(s: string, w: number): string {
  return s.slice(0, w).padEnd(w)
}

function table(rows: string[][]): void {
  if (!rows.length) return
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map(r => (r[i] ?? '').length)))
  for (const row of rows) {
    console.log(row.map((c, i) => col(c, widths[i]!)).join('  '))
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const [cmd, sub, ...rest] = args

async function main(): Promise<void> {
  // ── auth login ──────────────────────────────────────────────────────────────
  if (cmd === 'auth' && sub === 'login') {
    const baseUrl = rest[0]
    if (!baseUrl) { console.error('Usage: proxyos auth login <url>'); process.exit(1) }
    process.stdout.write('API key: ')
    const key = await new Promise<string>(resolve => {
      let buf = ''
      process.stdin.setRawMode?.(true)
      process.stdin.resume()
      process.stdin.setEncoding('utf-8')
      process.stdin.on('data', (ch: string) => {
        if (ch === '\r' || ch === '\n') { process.stdin.pause(); process.stdout.write('\n'); resolve(buf) }
        else if (ch === '\u0003') process.exit(1)
        else { buf += ch }
      })
    })
    saveConfig({ baseUrl, apiKey: key })
    console.log(`Logged in to ${baseUrl}`)
    return
  }

  const cfg = loadConfig()
  if (!cfg) { console.error('Not logged in. Run: proxyos auth login <url>'); process.exit(1) }

  // ── expose ──────────────────────────────────────────────────────────────────
  if (cmd === 'expose') {
    const upstream = sub
    if (!upstream) { console.error('Usage: proxyos expose <upstream> --domain <domain> [--tls auto|internal|off] [--template <id>]'); process.exit(1) }
    const domainIdx = rest.indexOf('--domain')
    const domain = domainIdx >= 0 ? rest[domainIdx + 1] : undefined
    if (!domain) { console.error('--domain is required'); process.exit(1) }
    const tlsIdx = rest.indexOf('--tls')
    const tlsMode = tlsIdx >= 0 ? (rest[tlsIdx + 1] ?? 'auto') : 'auto'
    const result = await api(cfg, 'POST', '/routes', { domain, upstreamType: 'http', upstreams: [{ url: upstream }], tlsMode, name: domain })
    console.log('Route created:', (result as { id: string }).id)
    return
  }

  // ── routes ───────────────────────────────────────────────────────────────────
  if (cmd === 'routes') {
    if (sub === 'list' || !sub) {
      const rows = await api(cfg, 'GET', '/routes') as Array<{ domain: string; enabled: boolean; tlsMode: string; upstreamType: string }>
      table([
        ['DOMAIN', 'STATUS', 'TLS', 'UPSTREAM'],
        ...rows.map(r => [r.domain, r.enabled ? 'active' : 'disabled', r.tlsMode, r.upstreamType]),
      ])
      return
    }
    if (sub === 'disable') {
      const domain = rest[0]
      if (!domain) { console.error('Usage: proxyos routes disable <domain>'); process.exit(1) }
      const routes = await api(cfg, 'GET', '/routes') as Array<{ id: string; domain: string }>
      const route = routes.find(r => r.domain === domain)
      if (!route) { console.error(`Route not found: ${domain}`); process.exit(1) }
      await api(cfg, 'POST', `/routes/${route.id}/disable`)
      console.log(`Disabled: ${domain}`)
      return
    }
    if (sub === 'delete') {
      const domain = rest[0]
      if (!domain) { console.error('Usage: proxyos routes delete <domain>'); process.exit(1) }
      const routes = await api(cfg, 'GET', '/routes') as Array<{ id: string; domain: string }>
      const route = routes.find(r => r.domain === domain)
      if (!route) { console.error(`Route not found: ${domain}`); process.exit(1) }
      await api(cfg, 'DELETE', `/routes/${route.id}`)
      console.log(`Deleted: ${domain}`)
      return
    }
  }

  // ── agents ───────────────────────────────────────────────────────────────────
  if (cmd === 'agents') {
    if (sub === 'list' || !sub) {
      const rows = await api(cfg, 'GET', '/agents') as Array<{ name: string; siteTag: string | null; status: string; routeCount: number }>
      table([
        ['NAME', 'SITE', 'STATUS', 'ROUTES'],
        ...rows.map(a => [a.name, a.siteTag ?? '—', a.status, String(a.routeCount)]),
      ])
      return
    }
  }

  // ── connections ───────────────────────────────────────────────────────────────
  if (cmd === 'connections') {
    if (sub === 'list' || !sub) {
      const rows = await api(cfg, 'GET', '/connections') as Array<{ name: string; type: string; status: string }>
      table([['NAME', 'TYPE', 'STATUS'], ...rows.map(c => [c.name, c.type, c.status])])
      return
    }
    if (sub === 'sync') {
      const name = rest[0]
      if (!name) { console.error('Usage: proxyos connections sync <name>'); process.exit(1) }
      const conns = await api(cfg, 'GET', '/connections') as Array<{ id: string; name: string }>
      const conn = conns.find(c => c.name === name)
      if (!conn) { console.error(`Connection not found: ${name}`); process.exit(1) }
      await api(cfg, 'POST', `/connections/${conn.id}/sync`)
      console.log(`Sync enqueued for: ${name}`)
      return
    }
  }

  // ── chain ────────────────────────────────────────────────────────────────────
  if (cmd === 'chain') {
    const domain = sub
    if (!domain) { console.error('Usage: proxyos chain <domain>'); process.exit(1) }
    const routes = await api(cfg, 'GET', '/routes') as Array<{ id: string; domain: string }>
    const route = routes.find(r => r.domain === domain)
    if (!route) { console.error(`Route not found: ${domain}`); process.exit(1) }
    console.log(`Chain view for ${domain} is available in the web UI at /routes/${route.id}`)
    return
  }

  // ── scan ─────────────────────────────────────────────────────────────────────
  if (cmd === 'scan') {
    await api(cfg, 'POST', '/scanner/scan')
    console.log('Scan enqueued')
    return
  }

  // ── help ─────────────────────────────────────────────────────────────────────
  console.log(`proxyos CLI v0.1.0

Commands:
  auth login <url>                Login to a ProxyOS instance
  expose <upstream> --domain <d>  Expose a service
  routes list                     List all routes
  routes disable <domain>         Disable a route
  routes delete <domain>          Delete a route
  chain <domain>                  Show chain view URL for a route
  agents list                     List agents
  connections list                List connections
  connections sync <name>         Sync a connection
  scan                            Trigger container scan`)
}

main().catch(err => {
  console.error((err as Error).message)
  process.exit(1)
})
