import type { Metadata } from 'next';
import { PricingCard } from '../../components/PricingCard';
import { PricingMatrix } from '../../components/PricingMatrix';
import { BandwidthCalculator } from '../../components/BandwidthCalculator';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ProxyOS Pricing — Free self-hosted, $9/mo Cloud',
  description:
    'Self-host ProxyOS free forever with unlimited routes. ProxyOS Cloud Solo from $9/mo. No seat fees. No route limits on self-hosted.',
};

const plans = [
  {
    tier: 'Self-hosted',
    price: '$0',
    description: 'MIT licensed. Unlimited routes, domains, upstreams. Run it yourself forever.',
    bullets: [
      'Unlimited routes',
      'Unlimited users',
      'All SSO providers',
      'Local analytics (unlimited)',
      'Community support',
    ],
    cta: 'Download →',
    ctaHref: '/#install',
  },
  {
    tier: 'Cloud Solo',
    price: '$9',
    priceAnnual: '$7',
    description: 'ProxyOS Cloud manages the dashboard and edge. 14-day free trial, no card required.',
    bullets: [
      '10 routes',
      '1 user',
      'Authentik + Authelia SSO',
      '30-day analytics retention',
      '100 GB bandwidth included',
    ],
    cta: 'Start free trial →',
    ctaHref: '/cloud',
    featured: true,
  },
  {
    tier: 'Cloud Teams',
    price: '$29',
    priceAnnual: '$23',
    description: 'Full feature set for small teams managing shared infrastructure.',
    bullets: [
      'Unlimited routes',
      '10 users included, $3/extra',
      'All SSO providers',
      '1-year analytics retention',
      '1 TB bandwidth included',
      'Business hrs support, 4h SLA',
    ],
    cta: 'Start free trial →',
    ctaHref: '/cloud',
  },
  {
    tier: 'Cloud Partners',
    price: '$99',
    description: 'Multi-tenant, white-label, MSP-ready. Plus $5/route.',
    bullets: [
      'Unlimited routes + tenants',
      'Unlimited users',
      'All providers + custom OIDC',
      '7-year analytics retention',
      'Custom bandwidth',
      '24/7 support, 1h SLA',
    ],
    cta: 'Contact sales →',
    ctaHref: '/cloud',
  },
];

const faq = [
  {
    q: 'Is the self-hosted version really unlimited?',
    a: 'Yes. Unlimited routes, domains, upstreams, users. No seat fees, no rate limiting, no expiry. MIT licensed.',
  },
  {
    q: 'What counts as a route?',
    a: 'One domain → one upstream mapping. gitbay.dev → 192.168.69.25:3000 is one route. Wildcard routes (*.example.com) count as one route.',
  },
  {
    q: 'What counts as a request for bandwidth calc?',
    a: 'Any HTTP request that passes through ProxyOS Cloud edge (Model A). Health check probes do not count.',
  },
  {
    q: 'Can I use Cloud with my existing Caddy config?',
    a: 'Yes — Model B (Teams+) lets ProxyOS Cloud dashboard push config to your own Caddy instance. Traffic stays on your infrastructure.',
  },
  {
    q: 'Annual billing discount',
    a: 'Annual billing gives 20% off on Solo and Teams. Billed once per year. Cancelation prorates.',
  },
  {
    q: 'Educational / non-profit pricing',
    a: '50% off Cloud plans. Apply at proxyos.app/edu.',
  },
  {
    q: 'Can I pay by invoice?',
    a: 'Yes on Teams+. Contact billing@proxyos.app.',
  },
  {
    q: 'Does ProxyOS offer a bug bounty?',
    a: 'Yes. Credit-only at V1. Monetary rewards coming V1.1+. See /security.',
  },
];

export default function PricingPage() {
  return (
    <>
      <section style={{ padding: '96px 24px 64px', maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
        <h1
          style={{
            fontSize: 'clamp(36px, 5vw, 56px)',
            fontWeight: 600,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            marginBottom: '20px',
          }}
        >
          Free to self-host.
          <br />
          <span style={{ color: 'var(--accent)' }}>Managed from $9/mo.</span>
        </h1>
        <p style={{ fontSize: '18px', color: 'var(--fg-mute)', maxWidth: '560px', margin: '0 auto 48px', lineHeight: 1.6 }}>
          ProxyOS self-hosted is MIT licensed and free forever. Unlimited routes, unlimited domains,
          unlimited upstreams. No seat fees. ProxyOS Cloud runs the dashboard — and optionally the edge
          — from $9/mo.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {plans.map((plan) => (
            <PricingCard key={plan.tier} {...plan} />
          ))}
        </div>
      </section>

      {/* Comparison matrix */}
      <section
        style={{
          padding: '64px 24px',
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        <h2 style={{ fontSize: '32px', fontWeight: 600, marginBottom: '32px', letterSpacing: '-0.02em' }}>
          Full comparison
        </h2>
        <PricingMatrix />
      </section>

      {/* Bandwidth calculator */}
      <div style={{ backgroundColor: 'var(--bg2)', padding: '64px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '32px', fontWeight: 600, marginBottom: '8px', textAlign: 'center', letterSpacing: '-0.02em' }}>
            Estimate your bandwidth
          </h2>
          <p style={{ fontSize: '16px', color: 'var(--fg-mute)', textAlign: 'center', marginBottom: '40px' }}>
            For Cloud Model A (edge-hosted). Self-hosted and Model B have no bandwidth limits.
          </p>
          <BandwidthCalculator />
        </div>
      </div>

      {/* FAQ */}
      <section style={{ padding: '64px 24px', maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '32px', fontWeight: 600, marginBottom: '40px', letterSpacing: '-0.02em' }}>
          Pricing FAQ
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {faq.map((item, i) => (
            <div
              key={item.q}
              style={{
                padding: '20px 0',
                borderBottom: i < faq.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--fg)', marginBottom: '8px' }}>
                {item.q}
              </h3>
              <p style={{ fontSize: '15px', color: 'var(--fg-mute)', lineHeight: 1.6, margin: 0 }}>
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA strip */}
      <div style={{ backgroundColor: 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '64px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '32px', fontWeight: 600, letterSpacing: '-0.02em' }}>
            Ready to get started?
          </h2>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link
              href="/#install"
              style={{
                padding: '12px 24px',
                background: 'var(--surf2)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--fg)',
              }}
            >
              Download self-hosted →
            </Link>
            <Link
              href="/cloud"
              style={{
                padding: '12px 24px',
                background: 'var(--accent)',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--accent-fg)',
              }}
            >
              Start Cloud free trial →
            </Link>
            <Link
              href="https://github.com/proxyos/proxyos"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '12px 24px',
                fontSize: '15px',
                fontWeight: 500,
                color: 'var(--fg-mute)',
              }}
            >
              View on GitHub ↗
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
