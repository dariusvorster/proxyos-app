import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ProxyOS vs Caddyfile — Why use ProxyOS instead of raw Caddy?',
  description: 'Caddy is great. ProxyOS wraps it with a UI, SQLite source of truth, audit log, and SSO toggle. No Caddyfile required.',
};

export default function VsCaddyFilePage() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-dim)', marginBottom: '16px' }}>
        // vs caddyfile
      </p>
      <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: '20px' }}>
        ProxyOS vs raw Caddyfile
      </h1>
      <p style={{ fontSize: '17px', color: 'var(--fg-mute)', lineHeight: 1.65, marginBottom: '40px' }}>
        Caddy is one of the best reverse proxies ever built. ProxyOS doesn&apos;t replace it — we wrap it.
        Use ProxyOS when your Caddyfile starts to grow and you want point-and-click management, SSO,
        analytics, and a change history without editing files.
      </p>
      {[
        {
          title: 'Caddy is already great.',
          body: "We mean it. HTTP/3, automatic HTTPS, internal CA, graceful reloads — all built in. ProxyOS is the dashboard layer. Caddy is still the engine, still the proxy, still handling every request.",
        },
        {
          title: 'The Caddyfile tradeoff.',
          body: 'Elegant for 5 routes. Impossible to reason about at 50. Who changed what, when? Which routes are actually getting traffic? Is that cert still valid? Caddyfiles don\'t answer these questions.',
        },
        {
          title: 'SQLite as source of truth.',
          body: 'ProxyOS stores routes in SQLite. Version-controllable exports. Audit log. Multi-operator safety — two people can\'t accidentally overwrite each other\'s changes. Import your Caddyfile to get started.',
        },
        {
          title: 'JSON API vs reload.',
          body: 'Routes go live in <50ms via Caddy\'s Admin API instead of 500ms+ for a config reload. For homelab this is academic. For anything production-adjacent, it matters.',
        },
      ].map((item) => (
        <div
          key={item.title}
          style={{
            background: 'var(--surf)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '24px',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--fg)', marginBottom: '10px' }}>{item.title}</h3>
          <p style={{ fontSize: '15px', color: 'var(--fg-mute)', lineHeight: 1.65, margin: 0 }}>{item.body}</p>
        </div>
      ))}
      <div style={{ marginTop: '32px', display: 'flex', gap: '12px' }}>
        <Link href="/#install" style={{ padding: '12px 24px', background: 'var(--accent)', borderRadius: '8px', fontSize: '15px', fontWeight: 600, color: 'var(--accent-fg)' }}>
          Try ProxyOS →
        </Link>
      </div>
    </section>
  );
}
