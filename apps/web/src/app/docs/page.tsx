'use client'

import { useState, useEffect } from 'react'
import { Topbar, PageContent } from '~/components/shell'

// ─── TOC structure ────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'expose-service',    label: 'Expose a service' },
  { id: 'routes',            label: 'Managing routes' },
  { id: 'tls',               label: 'TLS & certificates' },
  { id: 'dns-providers',     label: 'DNS providers' },
  { id: 'sso',               label: 'SSO / forward auth' },
  { id: 'analytics',         label: 'Analytics' },
  { id: 'agents',            label: 'Agents & federation' },
  { id: 'import',            label: 'Import existing config' },
  { id: 'security',          label: 'Security rules' },
  { id: 'monitors',          label: 'Monitors & alerts' },
  { id: 'logs',              label: 'Logs' },
  { id: 'audit',             label: 'Audit log' },
  { id: 'billing',           label: 'Billing & licences' },
  { id: 'settings',          label: 'Settings' },
  { id: 'tailscale',         label: 'Tailscale / Netbird' },
  { id: 'troubleshooting',   label: 'Troubleshooting' },
]

// ─── Inline style primitives ──────────────────────────────────────────────────

const h2: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  fontFamily: 'var(--font-sans)',
  color: 'var(--text)',
  marginBottom: 12,
  marginTop: 0,
  paddingBottom: 10,
  borderBottom: '1px solid var(--border)',
}

const h3: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'var(--font-sans)',
  color: 'var(--text)',
  marginBottom: 8,
  marginTop: 20,
}

const p: React.CSSProperties = {
  fontSize: 13,
  fontFamily: 'var(--font-sans)',
  color: 'var(--text2)',
  lineHeight: 1.7,
  margin: '0 0 10px',
}

const ul: React.CSSProperties = {
  fontSize: 13,
  fontFamily: 'var(--font-sans)',
  color: 'var(--text2)',
  lineHeight: 1.8,
  paddingLeft: 20,
  margin: '0 0 10px',
}

const code: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  background: 'var(--code-bg, rgba(99,102,241,0.1))',
  color: 'var(--accent)',
  padding: '1px 5px',
  borderRadius: 4,
}

const pre: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  background: 'var(--surf)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '14px 16px',
  overflowX: 'auto',
  color: 'var(--text)',
  lineHeight: 1.7,
  margin: '0 0 14px',
  whiteSpace: 'pre',
}

const callout = (tone: 'blue' | 'amber' | 'green'): React.CSSProperties => ({
  fontSize: 13,
  fontFamily: 'var(--font-sans)',
  lineHeight: 1.7,
  padding: '10px 14px',
  borderRadius: 8,
  margin: '0 0 14px',
  background: tone === 'blue'  ? 'rgba(99,102,241,0.08)'
            : tone === 'amber' ? 'rgba(245,158,11,0.08)'
            :                    'rgba(34,197,94,0.08)',
  borderLeft: `3px solid ${tone === 'blue' ? 'var(--accent)' : tone === 'amber' ? 'var(--amber,#f59e0b)' : 'var(--green,#22c55e)'}`,
  color: 'var(--text2)',
})

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 40, scrollMarginTop: 24 }}>
      <h2 style={h2}>{title}</h2>
      {children}
    </section>
  )
}

function Code({ children }: { children: string }) {
  return <code style={code}>{children}</code>
}

function Pre({ children }: { children: string }) {
  return <pre style={pre}>{children.trim()}</pre>
}

function Callout({ tone, children }: { tone: 'blue' | 'amber' | 'green'; children: React.ReactNode }) {
  return <div style={callout(tone)}>{children}</div>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [active, setActive] = useState<string>(SECTIONS[0].id)

  // Track active section via IntersectionObserver on the scroll container
  useEffect(() => {
    const container = contentRef.current?.closest('main') ?? document
    const observers: IntersectionObserver[] = []

    // Use a map to track which sections are intersecting, pick the topmost
    const visible = new Set<string>()

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            visible.add(id)
          } else {
            visible.delete(id)
          }
          // Pick the first SECTIONS entry that is visible
          const first = SECTIONS.find((s) => visible.has(s.id))
          if (first) setActive(first.id)
        },
        { root: container instanceof Document ? null : container, rootMargin: '0px 0px -60% 0px', threshold: 0 },
      )
      obs.observe(el)
      observers.push(obs)
    })

    return () => observers.forEach((o) => o.disconnect())
  }, [])

  function scrollTo(id: string) {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <Topbar title="Docs" />
      <PageContent>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 32, alignItems: 'start' }}>

          {/* TOC sidebar */}
          <nav style={{ position: 'sticky', top: 0, maxHeight: 'calc(100vh - 60px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4, paddingBottom: 16 }}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                style={{
                  textAlign: 'left',
                  background: active === s.id ? 'var(--accent-dim)' : 'transparent',
                  color: active === s.id ? 'var(--accent-dark)' : 'var(--text2)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  fontWeight: active === s.id ? 500 : 400,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div style={{ minWidth: 0, maxWidth: 760 }}>

            <Section id="expose-service" title="Expose a service">
              <p style={p}>
                The quickest way to put a service behind ProxyOS is the <strong>Expose</strong> flow.
                Click <Code>+ Expose service</Code> on the Dashboard or navigate to <Code>/expose</Code>.
              </p>
              <h3 style={h3}>Fields</h3>
              <ul style={ul}>
                <li><strong>Name</strong> — a friendly label (e.g. "Home Assistant")</li>
                <li><strong>Domain</strong> — the public hostname Caddy will listen on (e.g. <Code>ha.home.example.com</Code>)</li>
                <li><strong>Upstream URL</strong> — the internal address of your service (e.g. <Code>http://192.168.1.50:8123</Code>)</li>
                <li><strong>TLS mode</strong> — how Caddy obtains a certificate (see TLS section below)</li>
                <li><strong>SSO</strong> — optionally gate the service behind a forward-auth provider</li>
              </ul>
              <h3 style={h3}>What happens</h3>
              <ul style={ul}>
                <li>A route record is saved to the database</li>
                <li>Caddy is told about the route via its Admin API — no restart needed</li>
                <li>If TLS mode is <Code>auto</Code> or <Code>dns</Code>, Caddy begins certificate provisioning immediately</li>
                <li>The route appears in <Code>/routes</Code> within seconds</li>
              </ul>
            </Section>

            <Section id="routes" title="Managing routes">
              <p style={p}>All proxy rules live under <Code>/routes</Code>. Each route maps one domain to one or more upstreams.</p>
              <h3 style={h3}>Route list</h3>
              <ul style={ul}>
                <li>Green dot = enabled and live in Caddy</li>
                <li>Grey dot = disabled (Caddy rule removed, upstream unreachable won't affect other routes)</li>
                <li>Click a route to open its detail page</li>
              </ul>
              <h3 style={h3}>Route detail</h3>
              <p style={p}>From the detail page you can:</p>
              <ul style={ul}>
                <li><strong>Edit</strong> — change upstreams, TLS mode, SSO, rate limiting, IP allowlist, headers</li>
                <li><strong>Toggle</strong> — enable or disable the route without deleting it</li>
                <li><strong>Test</strong> — probe each upstream and see HTTP status + latency</li>
                <li><strong>Logs</strong> — view per-route access log entries</li>
                <li><strong>SLO</strong> — set uptime targets and see availability over time</li>
                <li><strong>Delete</strong> — permanently removes the route and its Caddy rule</li>
              </ul>
              <h3 style={h3}>Advanced options</h3>
              <ul style={ul}>
                <li><strong>Rate limiting</strong> — requests per window (e.g. 100 req / 1m)</li>
                <li><strong>IP allowlist</strong> — CIDR blocks that are allowed through (all others blocked)</li>
                <li><strong>Basic auth</strong> — username/password layer in front of the upstream</li>
                <li><strong>Compression</strong> — gzip/zstd response compression (on by default)</li>
                <li><strong>WebSocket / HTTP2 / HTTP3</strong> — protocol support toggles</li>
                <li><strong>Health check</strong> — path and interval for upstream health probing</li>
              </ul>
            </Section>

            <Section id="tls" title="TLS & certificates">
              <p style={p}>ProxyOS delegates all TLS to Caddy. Choose a mode per route:</p>
              <h3 style={h3}>TLS modes</h3>
              <ul style={ul}>
                <li><strong>auto</strong> (default) — Caddy obtains a Let's Encrypt certificate via HTTP-01. Requires port 80 reachable from the internet and a valid public DNS record pointing to your server.</li>
                <li><strong>dns</strong> — DNS-01 challenge. Works behind NAT or firewalls. Requires a DNS provider credential (see DNS Providers). Supports wildcard certs.</li>
                <li><strong>internal</strong> — Caddy issues a self-signed cert from its internal CA. Useful for LAN-only services. Your browser will show an untrusted cert warning unless you import the CA.</li>
                <li><strong>off</strong> — Plain HTTP only. No TLS. Useful when another proxy terminates TLS upstream.</li>
              </ul>
              <h3 style={h3}>Certificate list</h3>
              <p style={p}>Navigate to <Code>/certificates</Code> to see all certificates Caddy is managing, their expiry, renewal status, and source. You can also:</p>
              <ul style={ul}>
                <li>Request a multi-domain (SAN) certificate under <Code>Certificates → Multi-domain</Code></li>
                <li>Set up ACME settings under <Code>Certificates → ACME</Code></li>
                <li>View Certificate Transparency logs under <Code>Certificates → CT</Code></li>
              </ul>
              <Callout tone="green">
                Caddy renews certificates automatically 30 days before expiry. No manual action is needed.
              </Callout>
            </Section>

            <Section id="dns-providers" title="DNS providers">
              <p style={p}>DNS providers are credentials that Caddy uses to complete DNS-01 ACME challenges. Required when using <Code>tlsMode: dns</Code>.</p>
              <h3 style={h3}>Adding a DNS provider</h3>
              <ul style={ul}>
                <li>Go to <Code>/dns</Code> and click <strong>Add provider</strong></li>
                <li>Select the provider type (Cloudflare, Route53, DigitalOcean, etc.)</li>
                <li>Enter your API credentials (token or key+secret depending on provider)</li>
                <li>Save — the provider is now available when creating or editing routes</li>
              </ul>
              <h3 style={h3}>Supported providers</h3>
              <p style={p}>Cloudflare, AWS Route53, DigitalOcean, Namecheap, Porkbun, Gandi, and any provider supported by the Caddy DNS module ecosystem.</p>
            </Section>

            <Section id="sso" title="SSO / forward auth">
              <p style={p}>ProxyOS can gate any route behind a forward-auth provider. Supported providers include Authelia, Authentik, Keycloak, and any service that implements the forward-auth protocol.</p>
              <h3 style={h3}>Setting up a provider</h3>
              <ul style={ul}>
                <li>Go to <Code>/sso</Code> and click <strong>Add provider</strong></li>
                <li>Give it a name and select the type</li>
                <li><strong>Forward auth URL</strong> — the URL Caddy will call to verify each request (e.g. <Code>https://auth.example.com/api/verify</Code>)</li>
                <li><strong>Auth response headers</strong> — headers the auth service returns and that Caddy forwards to the upstream (e.g. <Code>Remote-User</Code>, <Code>Remote-Groups</Code>)</li>
                <li><strong>Trusted IPs</strong> — CIDRs that bypass SSO (e.g. your LAN subnet)</li>
                <li>Click <strong>Test</strong> to verify the provider URL is reachable before saving</li>
              </ul>
              <h3 style={h3}>Enabling SSO on a route</h3>
              <ul style={ul}>
                <li>Open the route detail and toggle <strong>SSO enabled</strong></li>
                <li>Select the provider from the dropdown</li>
                <li>Save — Caddy immediately requires auth before proxying requests to the upstream</li>
              </ul>
            </Section>

            <Section id="analytics" title="Analytics">
              <p style={p}>The Analytics page (<Code>/analytics</Code>) shows traffic data parsed from Caddy's JSON access log at <Code>/tmp/proxyos-access.log</Code>.</p>
              <ul style={ul}>
                <li><strong>Request volume</strong> — requests per hour/day broken down by route</li>
                <li><strong>Status distribution</strong> — 2xx / 3xx / 4xx / 5xx split</li>
                <li><strong>Top upstreams</strong> — which backends receive the most traffic</li>
                <li><strong>Latency</strong> — p50 / p95 / p99 response times per route</li>
                <li><strong>Bandwidth</strong> — bytes in/out per route</li>
              </ul>
              <p style={p}>Use the time range picker to zoom into specific windows. The data refreshes on every page load.</p>
            </Section>

            <Section id="agents" title="Agents & federation">
              <p style={p}>Agents let you manage remote ProxyOS instances from a single dashboard — useful for multi-server homelabs or edge deployments.</p>
              <h3 style={h3}>Adding an agent</h3>
              <ul style={ul}>
                <li>Go to <Code>/agents</Code> and click <strong>Add agent</strong></li>
                <li>Enter the remote ProxyOS URL and its API token</li>
                <li>The agent is polled for health and route count</li>
              </ul>
              <h3 style={h3}>Connections</h3>
              <p style={p}><Code>/connections</Code> manages outbound webhook connections to external systems (Slack, Discord, PagerDuty, custom webhooks). These are used by the Alerts and Monitors features.</p>
              <h3 style={h3}>Scanner</h3>
              <p style={p}><Code>/scanner</Code> scans your network for running services and suggests routes. Enter a CIDR range and port list; the scanner probes each host and returns a list of discovered endpoints you can expose with one click.</p>
            </Section>

            <Section id="import" title="Import existing config">
              <p style={p}>Already running Nginx, Traefik, or Caddy? Import your existing configuration at <Code>/import</Code>.</p>
              <h3 style={h3}>Supported formats</h3>
              <ul style={ul}>
                <li><strong>Nginx</strong> — paste or upload an <Code>nginx.conf</Code> / server block file</li>
                <li><strong>Traefik</strong> — paste a YAML dynamic config or Docker labels export</li>
                <li><strong>Caddy</strong> — paste a Caddyfile</li>
              </ul>
              <h3 style={h3}>Import flow</h3>
              <ul style={ul}>
                <li>Upload or paste your config</li>
                <li>ProxyOS parses it and shows a preview of routes it detected</li>
                <li>Deselect any routes you don't want to import</li>
                <li>Click <strong>Import</strong> — routes are created in the database and pushed to Caddy</li>
                <li>Import history is saved under <Code>/import/history</Code></li>
              </ul>
            </Section>

            <Section id="security" title="Security rules">
              <p style={p}><Code>/security</Code> provides a global security overview and lets you configure rules that apply across all routes.</p>
              <ul style={ul}>
                <li><strong>Global IP blocklist</strong> — block individual IPs or CIDRs from all routes</li>
                <li><strong>Bot protection</strong> — block known bad user agents and crawler signatures</li>
                <li><strong>Geo blocking</strong> — restrict traffic by country code (requires MaxMind GeoIP)</li>
                <li><strong>Security headers</strong> — enforce HSTS, CSP, X-Frame-Options, etc. globally</li>
                <li><strong>Vulnerability scanner</strong> — passive scan of incoming requests for common attack patterns</li>
              </ul>
            </Section>

            <Section id="monitors" title="Monitors & alerts">
              <p style={p}><Code>/monitors</Code> runs periodic uptime checks against your exposed services.</p>
              <h3 style={h3}>Adding a monitor</h3>
              <ul style={ul}>
                <li>Click <strong>Add monitor</strong> and enter the URL to check</li>
                <li>Set the check interval (30 s – 60 min)</li>
                <li>Optionally set expected HTTP status and a response body substring to assert</li>
                <li>Assign one or more notification connections (Slack, email, webhook)</li>
              </ul>
              <h3 style={h3}>Alerts</h3>
              <p style={p}><Code>/alerts</Code> shows triggered alert events. Each event records the monitor that fired, the time, the status code received, and the error message. Alerts auto-resolve when the next successful check completes.</p>
            </Section>

            <Section id="logs" title="Logs">
              <p style={p}><Code>/logs</Code> shows three log streams in one place:</p>
              <ul style={ul}>
                <li><strong>System</strong> — internal ProxyOS events (startup, Caddy push errors, auth events). Filter by level (info / warn / error) and category (caddy / auth / system / api / user).</li>
                <li><strong>Access</strong> — HTTP access log from Caddy. Shows method, path, status, latency, and client IP for every request.</li>
                <li><strong>Alerts</strong> — monitor alert events (same as the Alerts page, surfaced here for convenience).</li>
              </ul>
              <h3 style={h3}>Filtering</h3>
              <ul style={ul}>
                <li>Use the search box to full-text search log messages</li>
                <li>Use the date range pickers to scope to a time window</li>
                <li>Use the level and category dropdowns to narrow results</li>
                <li>Click <strong>Export CSV</strong> to download the filtered results</li>
              </ul>
              <Callout tone="blue">
                Caddy push errors (e.g. TLS failures when exposing a route) are written to the System log under category <Code>caddy</Code> with level <Code>error</Code> and include the full error message, domain, and TLS mode for easy diagnosis.
              </Callout>
            </Section>

            <Section id="audit" title="Audit log">
              <p style={p}><Code>/audit</Code> is an immutable record of every user action: route create/update/delete, SSO changes, user management, billing events, and settings changes.</p>
              <ul style={ul}>
                <li>Each entry shows the action, resource name, actor (user email), timestamp, and detail JSON</li>
                <li>Filter by action type or search by resource name</li>
                <li>Export to CSV for compliance reporting</li>
              </ul>
            </Section>

            <Section id="billing" title="Billing & licences">
              <p style={p}><Code>/billing</Code> manages your ProxyOS subscription or self-hosted licence key.</p>
              <h3 style={h3}>Cloud plans</h3>
              <ul style={ul}>
                <li><strong>Free</strong> — 3 routes, community support</li>
                <li><strong>Solo ($9/mo)</strong> — unlimited routes, SSO, DNS challenge, analytics</li>
                <li><strong>Teams ($29/mo)</strong> — everything in Solo plus multi-user, federation agents, priority support</li>
              </ul>
              <p style={p}>Click <strong>Upgrade</strong> on any plan card to be taken to the checkout. After payment you are redirected back to the dashboard and your plan is activated automatically.</p>
              <h3 style={h3}>Self-hosted licence keys</h3>
              <p style={p}>If you are running ProxyOS as a self-hosted deployment with a licence key:</p>
              <ul style={ul}>
                <li>Scroll to the <strong>Self-hosted licence</strong> section on the Billing page</li>
                <li>Paste your licence key and click <strong>Activate</strong></li>
                <li>The key is verified against the Lemon Squeezy API and stored locally</li>
                <li>To deactivate (e.g. to move to another server) click <strong>Deactivate</strong></li>
              </ul>
              <h3 style={h3}>Manage billing</h3>
              <p style={p}>Click <strong>Manage billing</strong> to open the Lemon Squeezy customer portal where you can update your payment method, download invoices, or cancel your subscription.</p>
            </Section>

            <Section id="settings" title="Settings">
              <h3 style={h3}>Profile (<Code>/settings/profile</Code>)</h3>
              <p style={p}>Update your display name, email, password, and avatar.</p>

              <h3 style={h3}>Users (<Code>/settings/users</Code>)</h3>
              <p style={p}>Invite additional users by email. Assign roles (admin or viewer). Admins can create and edit routes; viewers have read-only access.</p>

              <h3 style={h3}>API keys (<Code>/settings/api-keys</Code>)</h3>
              <p style={p}>Generate long-lived API tokens for programmatic access to the ProxyOS tRPC API. Tokens are shown once — store them securely.</p>

              <h3 style={h3}>Templates (<Code>/settings/templates</Code>)</h3>
              <p style={p}>Save route configurations as reusable templates (e.g. a standard WordPress setup with compression + rate limiting). Apply a template when creating a new route to pre-fill all fields.</p>

              <h3 style={h3}>Integrations (<Code>/settings/integrations</Code>)</h3>
              <p style={p}>Connect ProxyOS to third-party services: GitHub (for automation triggers), Grafana (push metrics), and Slack (notifications).</p>

              <h3 style={h3}>Caddy (<Code>/settings/caddy</Code>)</h3>
              <p style={p}>View the raw Caddy config currently loaded and manually trigger a config reload. Useful for debugging Caddy-level issues.</p>

              <h3 style={h3}>Export (<Code>/settings/export</Code>)</h3>
              <p style={p}>Export your entire ProxyOS configuration as JSON — routes, providers, settings — for backup or migration.</p>

              <h3 style={h3}>Tracing (<Code>/settings/tracing</Code>)</h3>
              <p style={p}>Enable OpenTelemetry tracing and configure an OTLP endpoint (Jaeger, Tempo, etc.) to receive distributed traces from ProxyOS.</p>
            </Section>

            <Section id="tailscale" title="Tailscale / Netbird">
              <p style={p}>
                ProxyOS works fully on private networks. If you access your homelab via Tailscale or Netbird you do not need a public domain — use the device IP and port directly.
              </p>
              <h3 style={h3}>Configuration</h3>
              <Pre>{`# In .env — use your Tailscale IP or MagicDNS hostname
PROXYOS_URL=http://100.x.x.x:3000

# Or with Tailscale MagicDNS
PROXYOS_URL=https://myserver.tail1234.ts.net:3000`}</Pre>
              <h3 style={h3}>Routing services over Tailscale</h3>
              <ul style={ul}>
                <li>Set <strong>TLS mode</strong> to <Code>internal</Code> so Caddy issues a self-signed cert (no Let's Encrypt needed since the domain isn't public)</li>
                <li>Or use <Code>off</Code> for plain HTTP inside the Tailscale tunnel</li>
                <li>Set the upstream to the Tailscale IP of the target machine (e.g. <Code>http://100.x.x.x:8080</Code>)</li>
              </ul>
              <Callout tone="green">
                Tailscale's MagicDNS supports HTTPS with its own CA. If you enable Tailscale HTTPS you can use <Code>tlsMode: off</Code> on ProxyOS and let Tailscale terminate TLS at the edge.
              </Callout>
            </Section>

            <Section id="troubleshooting" title="Troubleshooting">
              <h3 style={h3}>Caddy admin API not reachable</h3>
              <p style={p}>ProxyOS talks to Caddy on <Code>localhost:2019</Code> inside the container. If you see "Caddy admin API not reachable" in Logs, check that the Caddy process started correctly:</p>
              <Pre>{`docker logs proxyos | grep caddy`}</Pre>

              <h3 style={h3}>TLS push errors (invalid traversal path)</h3>
              <p style={p}>This occurs when Caddy has a persistent config volume from an older version that did not include the TLS app. Since v2, ProxyOS initialises the TLS app on every startup so this should not occur after rebuilding the container.</p>
              <Pre>{`docker compose up -d --build`}</Pre>

              <h3 style={h3}>Port already in use</h3>
              <p style={p}>If port 80 or 443 is taken by another service, change the host-side ports in <Code>.env</Code>:</p>
              <Pre>{`PROXYOS_HTTP_PORT=8080
PROXYOS_HTTPS_PORT=8443`}</Pre>
              <p style={p}>Caddy still listens on 80/443 inside the container — only the host mapping changes.</p>

              <h3 style={h3}>Dashboard not loading after port change</h3>
              <p style={p}>Set <Code>PROXYOS_DASHBOARD_PORT</Code> in <Code>.env</Code> and access the dashboard on the new port. The container-internal Next.js server always runs on port 3000.</p>

              <h3 style={h3}>Viewing full error details</h3>
              <p style={p}>All Caddy push errors are written to the System log in the UI. Go to <Code>/logs</Code>, set category to <Code>caddy</Code> and level to <Code>error</Code>. Each entry includes the domain, TLS mode, and the raw Caddy error message.</p>

              <h3 style={h3}>Database location</h3>
              <p style={p}>The SQLite database is stored at <Code>/data/proxyos/proxyos.db</Code> inside the container, backed by the <Code>proxyos-data</Code> Docker volume. To inspect it:</p>
              <Pre>{`docker exec -it proxyos sqlite3 /data/proxyos/proxyos.db .tables`}</Pre>

              <h3 style={h3}>Reset everything</h3>
              <p style={p}>To start completely fresh, remove the volumes:</p>
              <Pre>{`docker compose down -v
docker compose up -d`}</Pre>
              <Callout tone="amber">
                This deletes all routes, certificates, users, and Caddy state. Your <Code>.env</Code> is not affected.
              </Callout>
            </Section>

          </div>
        </div>
      </PageContent>
    </>
  )
}
