import Link from 'next/link';
import { HeroDashboard } from '../components/HeroDashboard';
import { FeatureCard } from '../components/FeatureCard';
import { PricingCard } from '../components/PricingCard';
import { InstallTabs } from '../components/InstallTabs';
import { OSFamilyStrip } from '../components/OSFamilyStrip';

const section: React.CSSProperties = {
  padding: '96px 24px',
  maxWidth: '1200px',
  margin: '0 auto',
};

const sectionBg2: React.CSSProperties = {
  backgroundColor: 'var(--bg2)',
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: '11px',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: 'var(--accent)',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <span style={{ width: '24px', height: '1px', background: 'var(--accent)', display: 'inline-block' }} />
      {children}
      <span style={{ width: '24px', height: '1px', background: 'var(--accent)', display: 'inline-block' }} />
    </p>
  );
}

const features = [
  {
    tag: 'ADMIN API',
    title: 'Routes go live in under 50ms.',
    body: 'ProxyOS speaks Caddy\'s JSON Admin API directly. No Caddyfile templates, no reloads, no config regeneration lag. Change a route — it\'s active instantly. SQLite is the source of truth; ProxyOS rebuilds Caddy state on every restart.',
  },
  {
    tag: 'TLS',
    title: 'Let\'s Encrypt, ZeroSSL, DNS-01, or internal CA.',
    body: 'Public domain with port 80 reachable → Let\'s Encrypt HTTP-01. Private domain → DNS-01 via Cloudflare. LAN-only service → Caddy\'s internal CA with automatic trust distribution. Cert expiry alerts built in.',
  },
  {
    tag: 'SSO',
    title: 'Two providers at V1. Keycloak & Zitadel stubbed.',
    body: 'Forward_auth handler generated per route. Headers copied, cache control respected, login URL correct first time. No OIDC config in ProxyOS — your SSO provider stays the authority.',
  },
  {
    tag: 'UPSTREAMS',
    title: 'Know when an upstream is down. Route around it.',
    body: 'Per-route health probes (HTTP, TCP, or custom). Dashboard shows upstream status. Alerts fire on upstream_down. V1.1 adds multi-upstream load balancing.',
  },
  {
    tag: 'EDGE FEATURES',
    title: 'Modern edge, no plugin zoo.',
    body: 'Rate limit per route by IP or header. Gzip + Zstd compression toggles. HTTP/3 (QUIC) on by default. IP allowlist / basic auth / forward_auth — layered in the right order automatically.',
  },
  {
    tag: 'OBSERVABILITY',
    title: 'Every change logged. Every problem alerted.',
    body: 'Hash-chained audit log of every route change, cert renewal, SSO config update. Alerts on upstream_down, cert_expiring, error_rate_spike. Email, Slack, Discord, or generic webhook.',
  },
];

const pricingPlans = [
  {
    tier: 'Self-hosted',
    price: '$0',
    description: 'MIT licensed. Unlimited routes, domains, upstreams. Run it yourself forever.',
    bullets: ['Unlimited routes', 'Unlimited users', 'All SSO providers', 'Local analytics'],
    cta: 'Download ProxyOS →',
    ctaHref: '#install',
  },
  {
    tier: 'Cloud Solo',
    price: '$9',
    priceAnnual: '$7',
    description: 'ProxyOS Cloud manages the dashboard and edge for you.',
    bullets: ['10 routes', '1 user', 'Authentik + Authelia', '30-day analytics'],
    cta: 'Start free trial →',
    ctaHref: '/cloud',
    featured: true,
  },
  {
    tier: 'Cloud Teams',
    price: '$29',
    priceAnnual: '$23',
    description: 'Full feature set for small teams managing shared infrastructure.',
    bullets: ['Unlimited routes', '10 users included', 'All SSO providers', '1-year analytics'],
    cta: 'Start free trial →',
    ctaHref: '/cloud',
  },
  {
    tier: 'Cloud Partners',
    price: '$99',
    description: 'Multi-tenant, white-label, MSP-ready.',
    bullets: ['Unlimited routes + tenants', 'Unlimited users', 'All providers + custom', '7-year analytics'],
    cta: 'Contact sales →',
    ctaHref: '/cloud',
  },
];

export default function Home() {
  return (
    <>
      {/* Section 1 — Hero */}
      <section style={{ backgroundColor: 'var(--bg)', padding: '96px 24px 64px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
          <Eyebrow>REVERSE PROXY THAT KNOWS YOUR INFRASTRUCTURE</Eyebrow>

          <h1
            style={{
              fontSize: 'clamp(40px, 6vw, 64px)',
              fontWeight: 600,
              lineHeight: 1.12,
              letterSpacing: '-0.02em',
              marginBottom: '24px',
            }}
          >
            <span style={{ color: 'var(--fg)', display: 'block' }}>Expose a service.</span>
            <span style={{ color: 'var(--fg-mute)', display: 'block' }}>Flip on SSO.</span>
            <span style={{ color: 'var(--accent)', display: 'block' }}>See the traffic.</span>
          </h1>

          <p
            style={{
              fontSize: '19px',
              fontWeight: 400,
              color: 'var(--fg-mute)',
              lineHeight: 1.6,
              maxWidth: '660px',
              margin: '0 auto 36px',
            }}
          >
            One button exposes a service behind TLS. One toggle adds Authentik or Authelia SSO.
            Built on Caddy&apos;s Admin API — routes go live in under 50ms, no config files, no reloads, no guessing.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
            <Link
              href="#install"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-fg)',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 600,
                display: 'inline-block',
              }}
            >
              Download ProxyOS →
            </Link>
            <Link
              href="/cloud"
              style={{
                backgroundColor: 'var(--surf2)',
                color: 'var(--fg)',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 500,
                border: '1px solid var(--border)',
                display: 'inline-block',
              }}
            >
              Try ProxyOS Cloud →
            </Link>
            <Link
              href="https://github.com/proxyos/proxyos"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--fg-mute)',
                fontSize: '16px',
                fontWeight: 500,
                padding: '12px 24px',
                display: 'inline-block',
              }}
            >
              View on GitHub ↗
            </Link>
          </div>

          <p
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '12px',
              color: 'var(--fg-dim)',
              marginBottom: '56px',
            }}
          >
            Self-hosted · MIT · Free forever &nbsp;│&nbsp; Cloud from $9/mo &nbsp;│&nbsp; Built on Caddy
          </p>

          <HeroDashboard />
        </div>
      </section>

      {/* Section 2 — The problem */}
      <div style={sectionBg2}>
        <section style={section}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '12px',
                color: 'var(--fg-dim)',
                marginBottom: '16px',
              }}
            >
              // the problem
            </p>
            <h2
              style={{
                fontSize: 'clamp(28px, 4vw, 48px)',
                fontWeight: 600,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
              }}
            >
              Reverse proxy config is
              <br />
              where homelab time goes to die.
            </h2>
          </div>

          <div
            style={{
              maxWidth: '880px',
              margin: '0 auto 32px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1px',
              background: 'var(--border)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            <div style={{ background: 'var(--surf)', padding: '28px 32px' }}>
              <p
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '12px',
                  color: 'var(--fg-dim)',
                  marginBottom: '20px',
                  fontWeight: 500,
                }}
              >
                The usual dance
              </p>
              {[
                'Edit nginx.conf with sudo vim',
                'Hope the syntax is right',
                'Reload and cross fingers',
                'Set up forward_auth by hand (again)',
                'Realise cert expired yesterday',
                'No idea which routes are actually getting traffic',
              ].map((item) => (
                <div key={item} style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--err)', fontSize: '15px', flexShrink: 0 }}>✗</span>
                  <span style={{ fontSize: '14px', color: 'var(--fg-mute)', lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--bg)', padding: '28px 32px' }}>
              <p
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '12px',
                  color: 'var(--accent)',
                  marginBottom: '20px',
                  fontWeight: 500,
                }}
              >
                With ProxyOS
              </p>
              {[
                'Expose wizard — source to TLS in 30 seconds',
                'SSO is a toggle, not a config chapter',
                'Certs auto-renewed, alerts before expiry',
                'Traffic analytics per route, live tail available',
                'Every route active in <50ms via Caddy Admin API',
                'SQLite is source of truth — never edit a file',
              ].map((item) => (
                <div key={item} style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--ok)', fontSize: '15px', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: '14px', color: 'var(--fg)', lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <p
            style={{
              maxWidth: '640px',
              margin: '0 auto',
              fontSize: '17px',
              color: 'var(--fg-mute)',
              lineHeight: 1.65,
              textAlign: 'center',
            }}
          >
            Caddy is one of the best reverse proxies ever built. Its Admin API is brilliant.
            Nobody uses it — they write Caddyfiles anyway. ProxyOS is the dashboard that makes
            the API the default.
          </p>
        </section>
      </div>

      {/* Section 3 — vs NPM */}
      <section style={section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '12px',
              color: 'var(--fg-dim)',
              marginBottom: '16px',
            }}
          >
            // for npm users
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: '16px' }}>
            Everything NPM does,
            <br />
            plus everything you&apos;ve wanted.
          </h2>
          <p style={{ fontSize: '17px', color: 'var(--fg-mute)', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 }}>
            Running Nginx Proxy Manager? ProxyOS imports your routes in one click. Keep what works.
            Add SSO, analytics, health checks, and a proxy that actually knows your network.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          {/* NPM column */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px' }}>
            <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-dim)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Static config</p>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--fg)', marginBottom: '20px' }}>Nginx Proxy Manager</h3>
            {[
              [true, 'Route management UI'],
              [true, "Let's Encrypt"],
              [true, 'Basic access lists'],
              [false, 'SSO / forward_auth toggle'],
              [false, 'Live traffic analytics'],
              [false, 'Health checks on upstreams'],
              [false, 'Rate limiting per route (UI)'],
              [false, 'DNS-01 for private domains'],
              [false, 'HTTP/3'],
              [false, 'Zero-downtime config reload'],
              [false, 'Certificate expiry alerting'],
              [false, 'Audit log'],
            ].map(([has, label]) => (
              <div key={String(label)} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <span style={{ color: has ? 'var(--ok)' : 'var(--err)', fontSize: '14px', flexShrink: 0 }}>{has ? '✓' : '✗'}</span>
                <span style={{ fontSize: '13px', color: 'var(--fg-mute)' }}>{String(label)}</span>
              </div>
            ))}
          </div>

          {/* ProxyOS column */}
          <div
            style={{
              background: 'var(--mark-bg)',
              border: '1.5px solid var(--accent)',
              borderRadius: '10px',
              padding: '24px',
              boxShadow: '0 0 32px var(--accent-dim)',
            }}
          >
            <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--accent)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Native Caddy</p>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--fg)', marginBottom: '20px' }}>ProxyOS</h3>
            {[
              'Expose wizard + route management',
              'Automatic HTTPS + DNS-01 + internal CA',
              'IP allowlist + rate limit per route',
              'SSO toggle (Authentik, Authelia)',
              'Built-in traffic analytics (1m/1h/1d)',
              'Upstream health checks with failover',
              'Rate limiting + compression + HTTP/3',
              'Wildcard and private domain certs',
              'Route activation in <50ms (JSON API)',
              'Cert expiry alerting + auto-renewal',
              'Full audit log',
            ].map((label) => (
              <div key={label} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--ok)', fontSize: '14px', flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: '13px', color: 'var(--fg)' }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Migration column */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px' }}>
            <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-dim)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>One click</p>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--fg)', marginBottom: '20px' }}>Import from NPM</h3>
            {[
              'Install ProxyOS alongside NPM',
              'Point /from-npm at your NPM instance',
              'Routes import: domains, upstreams, certs',
              'Verify imports in dry-run',
              'Switch DNS or load balancer to ProxyOS',
              'Keep NPM running during cutover',
              'Decommission NPM',
            ].map((label) => (
              <div key={label} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--accent)', fontSize: '14px', flexShrink: 0 }}>→</span>
                <span style={{ fontSize: '13px', color: 'var(--fg-mute)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <Link
            href="/from-npm"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              backgroundColor: 'var(--surf2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--fg)',
            }}
          >
            Import my NPM config →
          </Link>
        </div>
      </section>

      {/* Section 4 — Three killer features */}
      <div style={sectionBg2}>
        <section style={section}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-dim)', marginBottom: '16px' }}>
              // what makes proxyos different
            </p>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
              Three things that should be
              <br />
              one button. They are.
            </h2>
          </div>

          {/* Card 1 — One-button expose */}
          <div
            style={{
              background: 'var(--surf)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '40px',
              marginBottom: '16px',
              display: 'grid',
              gridTemplateColumns: '3fr 2fr',
              gap: '48px',
              alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--fg)', marginBottom: '16px' }}>
                Expose any service in 30 seconds.
              </h3>
              <p style={{ fontSize: '16px', color: 'var(--fg-mute)', lineHeight: 1.65 }}>
                Source IP:port. Domain name. TLS mode. Done. The wizard writes the Caddy JSON,
                validates it, pushes it via the Admin API, and watches the cert provision in real time.
                No Caddyfile. No reload. No 60-second wait for &quot;nginx -t &amp;&amp; systemctl reload&quot;.
              </p>
            </div>
            <div>
              {['Source', 'Domain', 'Access', 'Options', 'Review'].map((step, i) => (
                <div
                  key={step}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: i < 4 ? '8px' : '0',
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: i === 4 ? 'var(--accent)' : 'var(--surf2)',
                      border: `1px solid ${i === 4 ? 'var(--accent)' : 'var(--border)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: i === 4 ? 'white' : 'var(--fg-mute)',
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <span style={{ fontSize: '14px', color: i === 4 ? 'var(--fg)' : 'var(--fg-mute)', fontWeight: i === 4 ? 600 : 400 }}>
                    {step}
                    {i === 4 && (
                      <span style={{ marginLeft: '8px' }}>
                        <span
                          className="pulse-dot"
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--ok)',
                            display: 'inline-block',
                            marginRight: '4px',
                          }}
                        />
                        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--ok)' }}>
                          Cert provisioning
                        </span>
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2 — SSO toggle */}
          <div
            style={{
              background: 'var(--surf)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '40px',
              marginBottom: '16px',
              display: 'grid',
              gridTemplateColumns: '3fr 2fr',
              gap: '48px',
              alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--fg)', marginBottom: '16px' }}>
                SSO is one switch.
              </h3>
              <p style={{ fontSize: '16px', color: 'var(--fg-mute)', lineHeight: 1.65 }}>
                Flip the toggle. Pick your provider. Save. ProxyOS generates the forward_auth handler
                config for Caddy — with the right headers copied, the right matcher order, and no manual
                nginx auth_request snippets pasted from a five-year-old blog post.
              </p>
            </div>
            <div>
              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--fg-mute)' }}>SSO (Authentik)</span>
                  <div
                    style={{
                      width: '40px',
                      height: '22px',
                      borderRadius: '11px',
                      background: 'var(--accent)',
                      position: 'relative',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: 'white',
                        position: 'absolute',
                        right: '3px',
                        top: '3px',
                      }}
                    />
                  </div>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--ok)' }}>ON</span>
                </div>
                <pre
                  style={{
                    background: 'var(--surf)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '10px',
                    fontSize: '11px',
                    color: 'var(--accent-light)',
                    overflowX: 'auto',
                    margin: 0,
                  }}
                >
                  {`forward_auth {
  uri https://auth.example.com/
  copy_headers X-authentik-email
  copy_headers X-authentik-groups
}`}
                </pre>
              </div>
            </div>
          </div>

          {/* Card 3 — Analytics */}
          <div
            style={{
              background: 'var(--surf)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '40px',
              display: 'grid',
              gridTemplateColumns: '3fr 2fr',
              gap: '48px',
              alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--fg)', marginBottom: '16px' }}>
                Per-route analytics without Prometheus.
              </h3>
              <p style={{ fontSize: '16px', color: 'var(--fg-mute)', lineHeight: 1.65 }}>
                Caddy emits structured JSON access logs. ProxyOS parses them into SQLite time-series
                buckets — 1m / 1h / 1d. Per route: req rate, p95 latency, status code breakdown, top
                clients. Live tail on demand. No Grafana. No TSDB. Prometheus exporter available when
                you want it.
              </p>
            </div>
            <div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
                <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-dim)', marginBottom: '10px' }}>gitbay.dev · last 24h</p>
                <svg width="100%" height="48" viewBox="0 0 200 48" preserveAspectRatio="none">
                  <polyline
                    points="0,40 20,34 40,28 60,30 80,20 100,22 120,14 140,18 160,10 180,14 200,8"
                    stroke="#7C6FF0"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <polyline
                    points="0,40 20,34 40,28 60,30 80,20 100,22 120,14 140,18 160,10 180,14 200,8 200,48 0,48"
                    fill="rgba(124,111,240,0.08)"
                  />
                </svg>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '12px' }}>
                  {[['12,847', 'requests'], ['18ms', 'p95'], ['99.9%', 'success']].map(([val, label]) => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>{val}</div>
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px', color: 'var(--fg-dim)' }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Section 5 — Features grid */}
      <section style={section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
            Built for every situation.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {features.map((f) => (
            <FeatureCard key={f.tag} tag={f.tag} title={f.title} body={f.body} />
          ))}
          <div
            style={{
              background: 'transparent',
              border: '1px dashed var(--border2)',
              borderRadius: '10px',
              padding: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Link
              href="/features"
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--accent)',
                textDecoration: 'none',
              }}
            >
              See the full feature list →
            </Link>
          </div>
        </div>
      </section>

      {/* Section 6 — Infra OS integration */}
      <div style={sectionBg2}>
        <section style={section}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-dim)', marginBottom: '16px' }}>// better together</p>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
              Pair with Infra OS. Close the loop.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {[
              {
                title: 'Routes in the topology.',
                body: 'Infra OS knows every service in your stack. ProxyOS tells it which ones are exposed, under what domain, with what SSO. Topology view shows the full picture — service, route, cert, traffic.',
              },
              {
                title: 'Shared agent, shared truth.',
                body: 'The ios-agent knows about ProxyOS routes and feeds them into Infra OS\'s drift detector. A service that vanishes → route flagged. A route without a backing service → drift alert. One agent, two platforms.',
              },
              {
                title: '`ios expose` for free.',
                body: 'Once you run `ios expose <service>`, Infra OS asks ProxyOS to provision the route. SSO, TLS, health checks all configured automatically. V2.',
              },
            ].map((card) => (
              <div
                key={card.title}
                style={{
                  background: 'var(--surf)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '24px',
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--fg)', marginBottom: '12px' }}>
                  {card.title}
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--fg-mute)', lineHeight: 1.65 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Section 7 — TLS modes */}
      <section style={section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-dim)', marginBottom: '16px' }}>// tls</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
            TLS for every situation. No special cases.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {[
            {
              mode: 'Auto (public)',
              desc: "Let's Encrypt or ZeroSSL via HTTP-01 challenge. For any public domain reachable on port 80. Zero config. Renews 30 days before expiry.",
            },
            {
              mode: 'DNS-01 (private/wildcard)',
              desc: 'Cloudflare DNS challenge for private domains and wildcards. *.homelabza.com without exposing services publicly. Cloudflare at V1; Route53, DigitalOcean, DuckDNS at V1.1.',
            },
            {
              mode: 'Internal CA (LAN only)',
              desc: "Caddy's internal CA issues certs for LAN-only services. Agents enrolled with ProxyOS trust the CA automatically. No self-signed warnings on homarr.local again.",
            },
            {
              mode: 'Custom / BYO',
              desc: 'Bring your own cert and key. Upload via UI or mount via volume. ProxyOS manages rotation reminders; you manage provisioning.',
            },
          ].map((tls) => (
            <div
              key={tls.mode}
              style={{
                background: 'var(--surf)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '24px',
              }}
            >
              <div
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--accent)',
                  marginBottom: '12px',
                }}
              >
                {tls.mode}
              </div>
              <p style={{ fontSize: '14px', color: 'var(--fg-mute)', lineHeight: 1.65, margin: 0 }}>{tls.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 8 — Analytics preview */}
      <div style={sectionBg2}>
        <section style={section}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-dim)', marginBottom: '16px' }}>// analytics</p>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
              Watch the traffic. Per route. Live.
            </h2>
          </div>
          <div
            style={{
              background: 'var(--surf)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              overflow: 'hidden',
              marginBottom: '24px',
            }}
          >
            {/* Traffic strip chart */}
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-dim)', marginBottom: '12px' }}>Per-route traffic · last 24h</p>
              <svg width="100%" height="80" viewBox="0 0 800 80" preserveAspectRatio="none">
                {['#7C6FF0', '#00C896', '#F5A623', '#4A9EFF', '#E5484D', '#9D8FFF'].map((color, idx) => {
                  const pts = Array.from({ length: 13 }, (_, i) => {
                    const x = (i / 12) * 800;
                    const y = 10 + Math.random() * 60;
                    return `${x},${y}`;
                  }).join(' ');
                  return (
                    <polyline
                      key={color}
                      points={pts}
                      stroke={color}
                      strokeWidth="1.5"
                      fill="none"
                      opacity={idx === 0 ? 1 : 0.6}
                      strokeLinecap="round"
                    />
                  );
                })}
              </svg>
            </div>

            {/* Live tail */}
            <div style={{ padding: '24px' }}>
              <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-dim)', marginBottom: '12px' }}>Live tail</p>
              {[
                ['GET', '/api/repos', '200', '12ms', 'gitbay.dev'],
                ['GET', '/static/app.js', '304', '2ms', 'gitbay.dev'],
                ['POST', '/api/messages', '201', '38ms', 'zulip.homelabza.com'],
                ['GET', '/health', '200', '1ms', 'mxwatch.app'],
                ['GET', '/webhook/n8n', '200', '22ms', 'n8n.homelabza.com'],
              ].map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '50px 1fr 50px 60px 200px',
                    gap: '12px',
                    padding: '6px 0',
                    borderBottom: '1px solid var(--border)',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>{row[0]}</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-mute)' }}>{row[1]}</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--ok)' }}>{row[2]}</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-dim)' }}>{row[3]}</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-faint)' }}>{row[4]}</span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--fg-dim)', lineHeight: 1.65, textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>
            1-minute buckets for the last 24 hours. 1-hour buckets for the last 30 days. 1-day buckets
            for the last year. All in SQLite. No external TSDB required. Prometheus exporter ships in
            V1.1 when you want Grafana too.
          </p>
        </section>
      </div>

      {/* Section 9 — Pricing teaser */}
      <section style={section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: '12px' }}>
            Start free. Scale when you need to.
          </h2>
          <p style={{ fontSize: '17px', color: 'var(--fg-mute)' }}>
            Self-hosted is free forever. Cloud from $9/mo.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
          {pricingPlans.map((plan) => (
            <PricingCard key={plan.tier} {...plan} />
          ))}
        </div>
        <div style={{ textAlign: 'center' }}>
          <Link
            href="/pricing"
            style={{ fontSize: '15px', color: 'var(--accent)', fontWeight: 600 }}
          >
            See full pricing →
          </Link>
        </div>
      </section>

      {/* Section 10 — Install */}
      <div id="install" style={sectionBg2}>
        <section style={section}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: '12px' }}>
              Up in under 3 minutes.
            </h2>
            <p style={{ fontSize: '17px', color: 'var(--fg-mute)' }}>
              Open http://localhost:3000 and follow the setup wizard.
            </p>
          </div>
          <InstallTabs />
          <div style={{ textAlign: 'center', marginTop: '32px' }}>
            <p style={{ fontSize: '15px', color: 'var(--fg-mute)', marginBottom: '20px' }}>
              Add your first route, flip SSO on, watch traffic appear.
              <br />
              Total time to first exposed service: under 3 minutes.
            </p>
            <p style={{ fontSize: '14px', color: 'var(--fg-dim)', marginBottom: '16px' }}>Need a hand?</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              {[
                { label: 'Discord →', href: 'https://discord.gg/proxyos' },
                { label: 'GitHub Discussions →', href: 'https://github.com/proxyos/proxyos/discussions' },
                { label: 'r/selfhosted →', href: 'https://reddit.com/r/selfhosted' },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '10px 20px',
                    background: 'var(--surf)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--fg-mute)',
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Section 11 — OS Family strip */}
      <OSFamilyStrip />
    </>
  );
}
