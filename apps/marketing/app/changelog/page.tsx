import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ProxyOS Changelog',
  description: 'ProxyOS version history and release notes.',
};

const releases = [
  {
    version: 'v1.0.0',
    date: '2026-04-01',
    highlights: [
      'Expose wizard — source to TLS in 30 seconds',
      'SSO toggle for Authentik and Authelia',
      'Built-in traffic analytics (1m/1h/1d buckets)',
      'Auto HTTPS, DNS-01, and internal CA support',
      'Health checks per upstream',
      'Hash-chained audit log',
      'Rate limiting and compression per route',
      'HTTP/3 on by default',
      'SQLite as authoritative source of truth',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: '12px' }}>
        Changelog
      </h1>
      <p style={{ fontSize: '17px', color: 'var(--fg-mute)', marginBottom: '48px' }}>
        What&apos;s shipped, version by version.
      </p>

      {releases.map((release) => (
        <div key={release.version} style={{ marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--fg)' }}>{release.version}</h2>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-dim)' }}>{release.date}</span>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {release.highlights.map((item) => (
              <li key={item} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--ok)', flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: '15px', color: 'var(--fg-mute)', lineHeight: 1.5 }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
