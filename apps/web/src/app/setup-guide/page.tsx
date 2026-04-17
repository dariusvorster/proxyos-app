'use client'

import Link from 'next/link'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Card } from '~/components/ui'

const pre: React.CSSProperties = {
  margin: 0,
  padding: '10px 12px',
  background: 'var(--surface3)',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  color: 'var(--text)',
  overflowX: 'auto',
  whiteSpace: 'pre',
}

const h2: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  marginBottom: 10,
}

const p: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text2)',
  lineHeight: 1.6,
  margin: 0,
}

export default function SetupGuidePage() {
  return (
    <>
      <Topbar title="Setup Guide" />
      <PageContent>
        <PageHeader
          title="Setup Guide"
          desc="How ProxyOS fits into your homelab and how to expose services to the internet."
        />

        <Card header={<span>The architecture</span>}>
          <div style={{ padding: 14 }}>
            <pre style={pre}>{`Internet
  ↓
Cloudflare edge
  ↓
Cloudflare Tunnel (cloudflared container)
  ↓
ProxyOS  ← you are here
  ↓
your services (vaultwarden, gitea, sonarqube, etc.)`}</pre>
            <p style={{ ...p, marginTop: 10 }}>
              Every request from the internet hits ProxyOS. ProxyOS inspects the{' '}
              <code style={{ fontFamily: 'var(--font-mono)' }}>Host</code> header and forwards to
              the right internal service. Never configure a Cloudflare Tunnel to point directly at
              a service — it always points at ProxyOS.
            </p>
          </div>
        </Card>

        <Card header={<span>Prerequisite — mount the Docker socket</span>}>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={p}>
              Mount the Docker socket in ProxyOS's compose so it can auto-discover and join networks:
            </p>
            <pre style={pre}>{`services:
  proxyos:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock`}</pre>
            <p style={p}>
              Once mounted, check the{' '}
              <Link href="/settings/networks" style={{ color: 'var(--blue)' }}>Networks page</Link>
              {' '}— all relevant networks should show "Joined". Then the{' '}
              <Link href="/containers" style={{ color: 'var(--blue)' }}>Containers page</Link>
              {' '}shows everything ProxyOS can reach.
            </p>
          </div>
        </Card>

        <Card header={<span>Step 1 — Put cloudflared on the homelab-edge network</span>}>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={p}>
              ProxyOS creates a <code style={{ fontFamily: 'var(--font-mono)' }}>homelab-edge</code> network
              on startup. Cloudflared must join it so it can reach ProxyOS by container name.
            </p>
            <pre style={pre}>{`services:
  cloudflared:
    networks:
      - homelab-edge

networks:
  homelab-edge:
    external: true`}</pre>
          </div>
        </Card>

        <Card header={<span>Step 2 — Create a route in ProxyOS</span>}>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={p}>
              Open the{' '}
              <Link href="/containers" style={{ color: 'var(--blue)' }}>Containers page</Link>,
              find the service, and click "Create Route" on the relevant port. Fill in:
            </p>
            <ul style={{ ...p, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li><strong>Domain:</strong> the public hostname (e.g. <code style={{ fontFamily: 'var(--font-mono)' }}>vault.yourdomain.com</code>)</li>
              <li><strong>Upstream:</strong> pre-filled from the Containers page (e.g. <code style={{ fontFamily: 'var(--font-mono)' }}>http://vaultwarden:80</code>)</li>
              <li><strong>TLS:</strong> <code style={{ fontFamily: 'var(--font-mono)' }}>auto</code> or leave default if Cloudflare terminates TLS at the edge</li>
              <li><strong>WebSocket:</strong> enable if the service uses WebSockets (vaultwarden, sonarqube, etc.)</li>
            </ul>
          </div>
        </Card>

        <Card header={<span>Step 3 — Add the Cloudflare Tunnel public hostname</span>}>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={p}>
              Zero Trust → Networks → Tunnels → (your tunnel) → Public Hostname → Add:
            </p>
            <div style={{
              background: 'var(--surface3)',
              borderRadius: 4,
              padding: '8px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              color: 'var(--text)',
            }}>
              <div><span style={{ color: 'var(--text3)' }}>Subdomain:</span> vault <span style={{ color: 'var(--text3)' }}>(matches your ProxyOS route)</span></div>
              <div><span style={{ color: 'var(--text3)' }}>Domain:</span> yourdomain.com</div>
              <div><span style={{ color: 'var(--text3)' }}>Path:</span> <em style={{ color: 'var(--text3)' }}>(leave empty)</em></div>
              <div><span style={{ color: 'var(--text3)' }}>Service Type:</span> HTTP</div>
              <div><span style={{ color: 'var(--text3)' }}>Service URL:</span> proxyos:80</div>
            </div>
            <div style={{
              background: 'var(--surface2)',
              border: '1px solid var(--yellow)',
              borderRadius: 4,
              padding: '8px 12px',
              fontSize: 12,
              color: 'var(--text)',
            }}>
              <strong>Important:</strong> Always point the Service URL at{' '}
              <code style={{ fontFamily: 'var(--font-mono)' }}>proxyos:80</code> for every hostname.
              Never point it directly at a service — cloudflared isn't on that network, and you'd
              bypass all of ProxyOS's routing, SSO, and analytics.
            </div>
          </div>
        </Card>

        <Card header={<span>Step 4 — Test</span>}>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={p}>Verify each hop works:</p>
            <pre style={pre}>{`# 1. DNS resolves to Cloudflare
dig @1.1.1.1 vault.yourdomain.com +short

# 2. Tunnel routes to ProxyOS and ProxyOS routes to the service
curl -IL https://vault.yourdomain.com
# Expected: HTTP/2 200 (or login redirect), not a 502/503 from Cloudflare`}</pre>
            <p style={p}>
              If you get a 502, check <code style={{ fontFamily: 'var(--font-mono)' }}>docker logs cloudflared</code> — it'll say exactly what it couldn't reach.
            </p>
          </div>
        </Card>

        <Card header={<span>Common mistakes</span>}>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              {
                title: 'Pointing Cloudflare Tunnel at the service directly',
                body: 'Wrong: Service URL http://vaultwarden:80. Right: Service URL http://proxyos:80. Cloudflared probably can\'t resolve the container, and even if it could, you\'d bypass all ProxyOS features.',
              },
              {
                title: 'Leaving a regex in the Path field',
                body: 'Anything in Path restricts which URLs the tunnel routes. For a full-domain passthrough, leave Path empty.',
              },
              {
                title: 'Using container IPs as upstreams',
                body: 'IPs change when containers restart. Use container names — the Containers page shows you the correct name. They resolve via Docker DNS as long as ProxyOS is on the same network.',
              },
              {
                title: 'Multi-container services with generated names',
                body: 'Compose projects like authentik or zammad create containers named authentik-server-1 or zammad-zammad-nginx-1. Use the exact name shown on the Containers page.',
              },
            ].map((item) => (
              <div key={item.title}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{item.title}</div>
                <p style={p}>{item.body}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card header={<span>Cheat sheet</span>}>
          <div style={{ padding: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {[
                  ['Cloudflare Tunnel Service URL', 'http://proxyos:80 (every route)'],
                  ['Cloudflare Tunnel Path', '(empty — don\'t enter anything)'],
                  ['ProxyOS Upstream', 'http://<container-name>:<port>'],
                  ['Cloudflared network', 'homelab-edge (same as ProxyOS)'],
                  ['Docker socket mount', '/var/run/docker.sock:/var/run/docker.sock'],
                ].map(([label, value]) => (
                  <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 0', color: 'var(--text2)', width: '40%', paddingRight: 12 }}>{label}</td>
                    <td style={{ padding: '6px 0', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageContent>
    </>
  )
}
