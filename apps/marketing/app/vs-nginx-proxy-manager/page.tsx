import type { Metadata } from 'next';
import Link from 'next/link';
import { ComparisonTable } from '../../components/ComparisonTable';

export const metadata: Metadata = {
  title: 'ProxyOS vs Nginx Proxy Manager — Migration Guide',
  description:
    'Everything NPM does, plus SSO, analytics, health checks, and native Caddy HTTP/3. Import your NPM config in one click.',
};

const rows = [
  { feature: 'Route management UI', npm: true, proxyos: true },
  { feature: "Let's Encrypt", npm: true, proxyos: true },
  { feature: 'Basic access lists', npm: true, proxyos: true },
  { feature: 'SSO / forward_auth toggle', npm: false, proxyos: true },
  { feature: 'Live traffic analytics', npm: false, proxyos: true },
  { feature: 'Health checks on upstreams', npm: false, proxyos: true },
  { feature: 'Rate limiting per route (UI)', npm: false, proxyos: true },
  { feature: 'DNS-01 for private domains', npm: false, proxyos: true },
  { feature: 'HTTP/3', npm: false, proxyos: true },
  { feature: 'Zero-downtime config reload', npm: false, proxyos: 'JSON API <50ms' },
  { feature: 'Certificate expiry alerting', npm: false, proxyos: true },
  { feature: 'Audit log', npm: false, proxyos: true },
  { feature: 'Internal CA for LAN services', npm: false, proxyos: true },
  { feature: 'Wildcard cert (DNS-01)', npm: false, proxyos: true },
  { feature: 'Compression (Gzip + Zstd)', npm: false, proxyos: true },
  { feature: 'One-click import', npm: null, proxyos: 'Import from NPM' },
];

const faq = [
  { q: 'Does it import my certs?', a: "Let's Encrypt certs are re-issued (Caddy handles provisioning). Custom certs are copied during import." },
  { q: 'Does it import my custom nginx snippets?', a: 'No — ProxyOS uses Caddy, not nginx. Custom snippets need manual review and translation. Most common cases (websockets, headers) have wizard options.' },
  { q: 'Does it import my access lists?', a: 'Yes — IP allowlists and basic auth are imported and mapped to ProxyOS route-level access controls.' },
  { q: 'Can I run NPM alongside ProxyOS during migration?', a: 'Yes. Install ProxyOS on the same host (different port). Use dry-run mode. Switch DNS gradually. Keep NPM running until you\'re confident.' },
  { q: 'Does NPM\'s stream (TCP/UDP) routing import?', a: 'Not in V1. TCP/UDP passthrough is V1.1. Stream routes are flagged as skipped during import.' },
];

export default function VsNpmPage() {
  return (
    <>
      <section style={{ padding: '96px 24px 64px', maxWidth: '1200px', margin: '0 auto' }}>
        <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-dim)', marginBottom: '16px' }}>
          // for npm users
        </p>
        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 52px)',
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            marginBottom: '20px',
          }}
        >
          ProxyOS vs Nginx Proxy Manager
        </h1>
        <p style={{ fontSize: '18px', color: 'var(--fg-mute)', maxWidth: '620px', lineHeight: 1.6, marginBottom: '48px' }}>
          Everything NPM does, plus SSO, analytics, health checks, and a proxy that actually knows
          your network — things NPM hasn&apos;t added in five years.
        </p>

        <ComparisonTable rows={rows} />
      </section>

      {/* Why ProxyOS over NPM */}
      <div style={{ backgroundColor: 'var(--bg2)' }}>
        <section style={{ padding: '64px 24px', maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 600, marginBottom: '32px', letterSpacing: '-0.02em' }}>
            Why ProxyOS over NPM
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            {[
              {
                title: 'Active development',
                body: "NPM hasn't shipped a major feature in months. ProxyOS is under active development — new features land regularly. V1.1 brings Prometheus export, load balancing UI, and Keycloak support.",
              },
              {
                title: 'Caddy vs nginx',
                body: "Caddy has automatic HTTPS, HTTP/3, and an internal CA built in. nginx requires plugins, config gymnastics, and manual cert management. ProxyOS exposes all of Caddy's power through a clean UI.",
              },
              {
                title: 'Native SSO vs manual forward_auth',
                body: "NPM's SSO story is 'configure nginx auth_request by hand, find a blog post from 2019'. ProxyOS generates the forward_auth handler config for you — correct headers, correct matcher order, first time.",
              },
              {
                title: 'Built-in analytics vs nothing',
                body: 'NPM has zero per-route analytics. ProxyOS parses Caddy access logs into SQLite time-series buckets. Per route: req rate, p95 latency, status codes, top clients. Live tail on demand.',
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
                <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--fg)', marginBottom: '10px' }}>
                  {card.title}
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--fg-mute)', lineHeight: 1.65, margin: 0 }}>{card.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Migration checklist */}
      <section style={{ padding: '64px 24px', maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '28px', fontWeight: 600, marginBottom: '28px', letterSpacing: '-0.02em' }}>
          Migration checklist
        </h2>
        {[
          'Install ProxyOS alongside NPM (different port, same host is fine)',
          'Point /from-npm importer at your NPM instance URL',
          'Run dry-run — review what will be imported',
          'Import routes, certs, and access lists',
          'Verify each route in ProxyOS (test requests, check analytics)',
          'Switch DNS or load balancer to ProxyOS for one low-risk route',
          'Monitor for 24h, check analytics and alerts',
          'Gradually migrate remaining routes',
          'Keep NPM running until all routes verified',
          'Decommission NPM',
        ].map((step, i) => (
          <div
            key={step}
            style={{
              display: 'flex',
              gap: '16px',
              padding: '14px 0',
              borderBottom: '1px solid var(--border)',
              alignItems: 'flex-start',
            }}
          >
            <span
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'var(--surf2)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--fg-dim)',
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: '15px', color: 'var(--fg-mute)', lineHeight: 1.5 }}>{step}</span>
          </div>
        ))}
      </section>

      {/* Import CTA */}
      <div style={{ backgroundColor: 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 600, marginBottom: '12px', letterSpacing: '-0.02em' }}>
            Ready to migrate?
          </h2>
          <p style={{ fontSize: '16px', color: 'var(--fg-mute)', marginBottom: '24px' }}>
            Teams customers get a 30min migration consult to move large NPM instances.
          </p>
          <Link
            href="/from-npm"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              background: 'var(--accent)',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--accent-fg)',
            }}
          >
            Import my NPM config →
          </Link>
        </div>
      </div>

      {/* FAQ */}
      <section style={{ padding: '64px 24px', maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '28px', fontWeight: 600, marginBottom: '32px', letterSpacing: '-0.02em' }}>FAQ</h2>
        {faq.map((item, i) => (
          <div
            key={item.q}
            style={{
              padding: '20px 0',
              borderBottom: i < faq.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--fg)', marginBottom: '8px' }}>{item.q}</h3>
            <p style={{ fontSize: '15px', color: 'var(--fg-mute)', lineHeight: 1.6, margin: 0 }}>{item.a}</p>
          </div>
        ))}
      </section>
    </>
  );
}
