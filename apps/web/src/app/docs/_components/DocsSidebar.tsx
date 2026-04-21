'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DocsSearch from './DocsSearch'
import type { SearchEntry } from '../_lib/docs'

interface NavItem { label: string; path: string }
interface NavSection { section: string; items: NavItem[] }

const NAV_TREE: NavSection[] = [
  {
    section: 'Getting Started',
    items: [
      { label: 'Installation', path: 'getting-started/installation' },
      { label: 'First Route', path: 'getting-started/first-route' },
      { label: 'Concepts', path: 'getting-started/concepts' },
      { label: 'Docker Compose Reference', path: 'getting-started/docker-compose-reference' },
    ],
  },
  {
    section: 'Routes',
    items: [
      { label: 'Creating Routes', path: 'features/routes/creating-routes' },
      { label: 'Upstream Configuration', path: 'features/routes/upstream-configuration' },
      { label: 'TLS Modes', path: 'features/routes/tls-modes' },
      { label: 'Health Checks', path: 'features/routes/health-checks' },
      { label: 'Headers', path: 'features/routes/headers' },
      { label: 'Load Balancing', path: 'features/routes/load-balancing' },
      { label: 'Rate Limiting', path: 'features/routes/rate-limiting' },
      { label: 'WAF', path: 'features/routes/waf' },
      { label: 'WebSockets', path: 'features/routes/websockets' },
    ],
  },
  {
    section: 'Features',
    items: [
      { label: 'Redirect Hosts', path: 'features/redirect-hosts' },
      { label: 'Error Hosts', path: 'features/error-hosts' },
      { label: 'Streams (TCP/UDP)', path: 'features/streams' },
      { label: 'SSO / Forward Auth', path: 'features/sso' },
      { label: 'Federation', path: 'features/federation' },
      { label: 'Certificates', path: 'features/certificates' },
      { label: 'Analytics', path: 'features/analytics' },
      { label: 'Upstream Health', path: 'features/upstream-health' },
      { label: 'Docker Networks', path: 'features/docker-networks' },
      { label: 'Scanner', path: 'features/scanner' },
      { label: 'Audit Log', path: 'features/audit-log' },
    ],
  },
  {
    section: 'Deployment',
    items: [
      { label: 'Behind Cloudflare Tunnel', path: 'deployment/behind-cloudflare-tunnel' },
      { label: 'Behind Another Proxy', path: 'deployment/behind-another-proxy' },
      { label: 'Direct LAN', path: 'deployment/direct-lan' },
      { label: 'Tailscale', path: 'deployment/tailscale' },
      { label: 'Trusted Proxies', path: 'deployment/trusted-proxies' },
    ],
  },
  {
    section: 'Troubleshooting',
    items: [
      { label: 'Problem Index', path: 'troubleshooting' },
      { label: 'Not Authenticated', path: 'troubleshooting/not-authenticated' },
      { label: 'Holding Page Shown', path: 'troubleshooting/holding-page-shown' },
      { label: 'Mixed Content Errors', path: 'troubleshooting/mixed-content-errors' },
      { label: '502 Bad Gateway', path: 'troubleshooting/502-bad-gateway' },
      { label: 'Cloudflared DNS Errors', path: 'troubleshooting/cloudflared-dns-errors' },
      { label: 'HTTPS Upstream Refused', path: 'troubleshooting/https-upstream-connection-refused' },
      { label: 'Upstream Health Failed', path: 'troubleshooting/upstream-health-failed' },
      { label: 'Routes Not Saving', path: 'troubleshooting/routes-not-saving' },
      { label: "Container Won't Start", path: 'troubleshooting/container-wont-start' },
      { label: 'Cookie Not Persisting', path: 'troubleshooting/cookie-not-persisting' },
      { label: 'Secret Rotation Logout', path: 'troubleshooting/secret-rotation-logout' },
    ],
  },
  {
    section: 'Admin',
    items: [
      { label: 'Environment Variables', path: 'admin/environment-variables' },
      { label: 'Secrets Management', path: 'admin/secrets-management' },
      { label: 'Logging', path: 'admin/logging' },
      { label: 'Database', path: 'admin/database' },
      { label: 'Backup & Restore', path: 'admin/backup-and-restore' },
      { label: 'Upgrades', path: 'admin/upgrades' },
      { label: 'Security Hardening', path: 'admin/security-hardening' },
    ],
  },
  {
    section: 'API',
    items: [
      { label: 'Authentication', path: 'api/authentication' },
      { label: 'Routes Endpoints', path: 'api/routes-endpoints' },
      { label: 'Scopes & Permissions', path: 'api/scopes-and-permissions' },
    ],
  },
]

export default function DocsSidebar({ index = [] }: { index?: SearchEntry[] }) {
  const pathname = usePathname()

  return (
    <nav
      style={{
        position: 'sticky',
        top: 'var(--topbar-h)',
        maxHeight: 'calc(100vh - var(--topbar-h))',
        overflowY: 'auto',
        borderRight: '1px solid var(--border)',
        padding: '12px 0 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      <DocsSearch index={index} />
      <Link
        href="/docs"
        style={{
          display: 'block',
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          fontWeight: pathname === '/docs' ? 500 : 400,
          color: pathname === '/docs' ? 'var(--accent-dark)' : 'var(--text2)',
          background: pathname === '/docs' ? 'var(--accent-dim)' : 'transparent',
          padding: '5px 16px',
          textDecoration: 'none',
          borderRadius: 0,
          marginBottom: 6,
        }}
      >
        Overview
      </Link>

      {NAV_TREE.map(({ section, items }) => (
        <div key={section} style={{ marginBottom: 4 }}>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text3)',
              padding: '10px 16px 4px',
            }}
          >
            {section}
          </div>
          {items.map(({ label, path: itemPath }) => {
            const href = `/docs/${itemPath}`
            const active = pathname === href
            return (
              <Link
                key={itemPath}
                href={href}
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  fontWeight: active ? 500 : 400,
                  color: active ? 'var(--accent-dark)' : 'var(--text2)',
                  background: active ? 'var(--accent-dim)' : 'transparent',
                  padding: '5px 16px',
                  textDecoration: 'none',
                  transition: 'background 0.1s, color 0.1s',
                }}
              >
                {label}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
