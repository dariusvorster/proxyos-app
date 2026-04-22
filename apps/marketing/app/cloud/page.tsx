import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ProxyOS Cloud — Managed Reverse Proxy',
  description:
    'Expose services from anywhere without port forwarding. Cloud dashboard + edge, or dashboard-only with your own Caddy. From $9/mo.',
};

const faq = [
  { q: 'Where does ProxyOS Cloud run?', a: 'EU: Hetzner Falkenstein (fsn1) + anycast PoPs. US: AWS us-east-1 + Cloudflare anycast.' },
  { q: 'How does the tunnel work?', a: 'Outbound-only WebSocket from your agent to our edge. No inbound ports. Reconnects automatically.' },
  { q: 'Does my traffic pass through your servers on Model A?', a: 'Yes — that\'s the point. Contents are not logged or stored. Request metadata (method, path, status, timing) is kept per your retention setting.' },
  { q: 'Does my traffic pass through your servers on Model B?', a: 'No — dashboard control only. Traffic never leaves your infrastructure.' },
  { q: 'Is Model B actually self-hosted then?', a: 'Yes, with a managed control plane. Best of both — centralised management, decentralised data path.' },
  { q: 'What if you go out of business?', a: 'Config exported nightly to your git repo or S3 bucket. Self-hosted ProxyOS imports it in one step. Zero migration time.' },
  { q: 'Can I move from Cloud to self-hosted?', a: 'Yes, any time, no charges. About 15 minutes: export routes → install self-hosted → import.' },
  { q: 'Do you store my request bodies?', a: 'Never. Only structured metadata.' },
  { q: 'Can I turn off analytics entirely?', a: 'Yes — per route or globally. Zero-log mode for compliance-heavy routes.' },
  { q: "What's my data residency?", a: 'Strict — EU routes never touch US infrastructure and vice versa, enforced at VPC level.' },
  { q: 'SLA?', a: '99.9% for Solo, 99.95% for Teams, 99.99% for Partners. Credits on breach.' },
  { q: 'Bring my own storage for analytics?', a: 'V1.1 — point analytics to your S3 bucket for unlimited retention.' },
];

const plans = [
  {
    tier: 'Solo',
    price: '$9/mo',
    routes: '10',
    users: '1',
    bandwidth: '100 GB included',
    model: 'Model A only',
    retention: '30 days',
    support: '—',
    cta: 'Start free trial',
  },
  {
    tier: 'Teams',
    price: '$29/mo',
    routes: 'Unlimited',
    users: '10 included, $3/extra',
    bandwidth: '1 TB included',
    model: 'A + B',
    retention: '1 year',
    support: 'Business hrs, 4h SLA',
    cta: 'Start free trial',
    featured: true,
  },
  {
    tier: 'Partners',
    price: '$99/mo + $5/route',
    routes: 'Unlimited across tenants',
    users: 'Unlimited',
    bandwidth: 'Custom',
    model: 'A + B, custom regions',
    retention: '7 years',
    support: '24/7, 1h SLA',
    cta: 'Contact sales',
  },
];

export default function CloudPage() {
  return (
    <>
      {/* Hero */}
      <section style={{ padding: '96px 24px 64px', maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
        <p
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '11px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--accent)',
            marginBottom: '24px',
          }}
        >
          PROXYOS CLOUD · MANAGED REVERSE PROXY
        </p>
        <h1
          style={{
            fontSize: 'clamp(36px, 5vw, 56px)',
            fontWeight: 600,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            marginBottom: '20px',
          }}
        >
          Expose services from anywhere.
          <br />
          <span style={{ color: 'var(--accent)' }}>We handle the edge.</span>
        </h1>
        <p style={{ fontSize: '18px', color: 'var(--fg-mute)', maxWidth: '580px', margin: '0 auto 36px', lineHeight: 1.6 }}>
          ProxyOS Cloud runs the dashboard and — optionally — the edge. Flip services online from a
          browser, add SSO, watch live traffic. Your storage, your auth providers, your call on where
          the proxy lives.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
          <Link
            href="#plans"
            style={{
              padding: '12px 24px',
              background: 'var(--accent)',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--accent-fg)',
            }}
          >
            Start 14-day free trial →
          </Link>
          <Link
            href="/pricing"
            style={{
              padding: '12px 24px',
              background: 'var(--surf2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 500,
              color: 'var(--fg)',
            }}
          >
            Compare plans →
          </Link>
        </div>
        <p
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '12px',
            color: 'var(--fg-dim)',
          }}
        >
          Data residency: EU or US · Traffic never logged · GDPR-compliant
          <br />
          Two deployment models: edge-hosted (default) · agent-to-your-Caddy (Teams+)
        </p>
      </section>

      {/* Two deployment models */}
      <div style={{ backgroundColor: 'var(--bg2)' }}>
        <section style={{ padding: '64px 24px', maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '32px', fontWeight: 600, marginBottom: '40px', textAlign: 'center', letterSpacing: '-0.02em' }}>
            Two deployment models.
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Model A */}
            <div
              style={{
                background: 'var(--surf)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '32px',
              }}
            >
              <div
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '11px',
                  color: 'var(--accent)',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '8px',
                }}
              >
                Model A · Default (Solo)
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--fg)', marginBottom: '16px' }}>
                Edge-hosted
              </h3>
              <p style={{ fontSize: '15px', color: 'var(--fg-mute)', lineHeight: 1.65, marginBottom: '20px' }}>
                ProxyOS Cloud runs the dashboard AND the edge. Traffic hits our Tier-1 anycast network
                first, then tunnels to your services. No public port forwarding needed. DDoS protection
                included.
              </p>
              <p style={{ fontSize: '14px', color: 'var(--fg-dim)', marginBottom: '20px' }}>
                <strong style={{ color: 'var(--fg)' }}>Best for:</strong> homelabs behind CGNAT, services with no public IP,
                anyone who doesn&apos;t want to run a proxy process.
              </p>
              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '12px',
                  color: 'var(--fg-mute)',
                  lineHeight: 1.8,
                }}
              >
                [End users] → [ProxyOS Cloud anycast edge]<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ [Secure tunnel] → [Your services]
              </div>
            </div>

            {/* Model B */}
            <div
              style={{
                background: 'var(--surf)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '32px',
              }}
            >
              <div
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '11px',
                  color: 'var(--info)',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '8px',
                }}
              >
                Model B · Teams+
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--fg)', marginBottom: '16px' }}>
                Agent-to-your-Caddy
              </h3>
              <p style={{ fontSize: '15px', color: 'var(--fg-mute)', lineHeight: 1.65, marginBottom: '20px' }}>
                ProxyOS Cloud runs the dashboard only. Caddy runs on your infrastructure. Traffic flows
                direct to your edge — our dashboard just pushes config via WebSocket when you change a
                route.
              </p>
              <p style={{ fontSize: '14px', color: 'var(--fg-dim)', marginBottom: '20px' }}>
                <strong style={{ color: 'var(--fg)' }}>Best for:</strong> existing public IPs, compliance needs (PCI/HIPAA),
                environments where traffic cannot transit third-party networks.
              </p>
              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '12px',
                  color: 'var(--fg-mute)',
                  lineHeight: 1.8,
                }}
              >
                [End users] → [Your Caddy/ProxyOS agent]<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ [Your services]<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↑ config via WebSocket<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[ProxyOS Cloud dashboard]
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Plans */}
      <section id="plans" style={{ padding: '64px 24px', maxWidth: '1200px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '32px', fontWeight: 600, marginBottom: '40px', textAlign: 'center', letterSpacing: '-0.02em' }}>
          Cloud plans
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {plans.map((plan) => (
            <div
              key={plan.tier}
              style={{
                background: plan.featured ? 'var(--mark-bg)' : 'var(--surf)',
                border: `${plan.featured ? '1.5px' : '1px'} solid ${plan.featured ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '12px',
                padding: '28px 24px',
                boxShadow: plan.featured ? '0 0 40px var(--accent-ring)' : 'none',
              }}
            >
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: plan.featured ? 'var(--accent)' : 'var(--fg)', marginBottom: '4px' }}>
                {plan.tier}
              </h3>
              <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--fg)', marginBottom: '20px' }}>{plan.price}</div>
              {[
                ['Routes', plan.routes],
                ['Users', plan.users],
                ['Bandwidth', plan.bandwidth],
                ['Deployment', plan.model],
                ['Analytics', plan.retention],
                ['Support', plan.support],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '13px',
                  }}
                >
                  <span style={{ color: 'var(--fg-dim)' }}>{label}</span>
                  <span style={{ color: 'var(--fg)', fontWeight: 500 }}>{value}</span>
                </div>
              ))}
              <Link
                href={plan.cta === 'Contact sales' ? 'mailto:sales@proxyos.app' : '/cloud'}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  marginTop: '20px',
                  padding: '10px 20px',
                  background: plan.featured ? 'var(--accent)' : 'var(--surf2)',
                  border: plan.featured ? 'none' : '1px solid var(--border)',
                  borderRadius: '7px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: plan.featured ? 'var(--accent-fg)' : 'var(--fg)',
                }}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Security */}
      <div style={{ backgroundColor: 'var(--bg2)' }}>
        <section style={{ padding: '64px 24px', maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 600, marginBottom: '24px', letterSpacing: '-0.02em' }}>Security</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              'TLS 1.3 end-to-end (agents to edge and edge to origin)',
              'Mutual TLS between your agent and our dashboard',
              'Traffic metadata only — request contents never logged or stored',
              'Option to disable all analytics per route (zero-log mode)',
              'Tunnel keys rotated every 24h',
              'Annual penetration test (reports available under NDA to Teams+)',
              'SOC2 Type II in progress, ETA Q4 2026',
            ].map((item) => (
              <li key={item} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--ok)', flexShrink: 0 }}>·</span>
                <span style={{ fontSize: '15px', color: 'var(--fg-mute)' }}>{item}</span>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: '20px' }}>
            <Link href="/security" style={{ fontSize: '14px', color: 'var(--accent)' }}>
              Full security overview →
            </Link>
          </p>
        </section>
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

      {/* CTA */}
      <div style={{ backgroundColor: 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 600, marginBottom: '8px', letterSpacing: '-0.02em' }}>
            Start your free 14-day trial.
          </h2>
          <p style={{ fontSize: '16px', color: 'var(--fg-mute)', marginBottom: '24px' }}>
            No credit card required until day 14.
          </p>
          <Link
            href="/cloud"
            style={{
              display: 'inline-block',
              padding: '14px 32px',
              background: 'var(--accent)',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--accent-fg)',
            }}
          >
            Start free trial →
          </Link>
        </div>
      </div>
    </>
  );
}
