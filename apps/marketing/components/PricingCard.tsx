'use client';

interface PricingCardProps {
  tier: string;
  price: string;
  priceAnnual?: string;
  description: string;
  bullets: string[];
  cta: string;
  ctaHref: string;
  featured?: boolean;
  annual?: boolean;
}

export function PricingCard({
  tier,
  price,
  priceAnnual,
  description,
  bullets,
  cta,
  ctaHref,
  featured = false,
  annual = false,
}: PricingCardProps) {
  const displayPrice = annual && priceAnnual ? priceAnnual : price;

  return (
    <div
      style={{
        background: featured ? 'var(--mark-bg)' : 'var(--surf)',
        border: `${featured ? '1.5px' : '1px'} solid ${featured ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '12px',
        padding: '28px 24px',
        boxShadow: featured ? '0 0 40px var(--accent-ring)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
      }}
    >
      {featured && (
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '10px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--accent)',
            background: 'var(--accent-dim)',
            padding: '3px 8px',
            borderRadius: '4px',
            display: 'inline-block',
            marginBottom: '12px',
            alignSelf: 'flex-start',
          }}
        >
          Most popular
        </span>
      )}
      <p
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '11px',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--fg-dim)',
          marginBottom: '8px',
        }}
      >
        {tier}
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px' }}>
        <span style={{ fontSize: '36px', fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>
          {displayPrice}
        </span>
        {displayPrice !== '$0' && (
          <span style={{ fontSize: '14px', color: 'var(--fg-dim)' }}>/mo</span>
        )}
      </div>
      {annual && priceAnnual && (
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--ok)', marginBottom: '4px' }}>
          20% off with annual billing
        </span>
      )}
      <p style={{ fontSize: '14px', color: 'var(--fg-mute)', lineHeight: 1.5, marginBottom: '20px' }}>
        {description}
      </p>
      <a
        href={ctaHref}
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '10px 20px',
          borderRadius: '7px',
          fontSize: '14px',
          fontWeight: 600,
          marginBottom: '24px',
          background: featured ? 'var(--accent)' : 'var(--surf2)',
          color: featured ? 'var(--accent-fg)' : 'var(--fg)',
          border: featured ? 'none' : '1px solid var(--border)',
          transition: 'opacity 0.15s',
        }}
      >
        {cta}
      </a>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {bullets.map((b) => (
          <li key={b} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--ok)', fontSize: '14px', flexShrink: 0 }}>✓</span>
            <span style={{ fontSize: '13px', color: 'var(--fg-mute)', lineHeight: 1.5 }}>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
