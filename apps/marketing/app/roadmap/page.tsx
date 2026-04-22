import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ProxyOS Roadmap',
  description: 'What\'s coming to ProxyOS — V1, V1.1, and V2 themes.',
};

const roadmap = [
  {
    version: 'V1 — Now',
    status: 'shipped',
    items: [
      'Authentik + Authelia SSO',
      'Built-in analytics (SQLite time-series)',
      'Expose wizard',
      'DNS-01 via Cloudflare',
      'Internal CA (Caddy)',
      'Health checks per upstream',
      'Hash-chained audit log',
      'Rate limiting + compression + HTTP/3',
    ],
  },
  {
    version: 'V1.1 — Next',
    status: 'planned',
    items: [
      'Prometheus exporter',
      'Load balancing UI (multi-upstream)',
      'Keycloak SSO',
      'DNS-01: Route53, DigitalOcean, DuckDNS',
      'Zitadel SSO (stub)',
      'Grafana dashboard template',
      'ProxyOS Cloud (Solo + Teams)',
    ],
  },
  {
    version: 'V2 — Future',
    status: 'future',
    items: [
      'TCP/UDP passthrough routing',
      'Multi-upstream load balancing (full)',
      '`ios expose` routing (Infra OS integration)',
      'High availability mode',
      'Multi-instance federation',
    ],
  },
];

const statusColors: Record<string, string> = {
  shipped: 'var(--ok)',
  planned: 'var(--accent)',
  future: 'var(--fg-dim)',
};

export default function RoadmapPage() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: '12px' }}>
        Roadmap
      </h1>
      <p style={{ fontSize: '17px', color: 'var(--fg-mute)', marginBottom: '48px' }}>
        What&apos;s shipped, what&apos;s coming, what&apos;s planned.
      </p>

      {roadmap.map((phase) => (
        <div key={phase.version} style={{ marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--fg)' }}>{phase.version}</h2>
            <span
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'var(--surf2)',
                color: statusColors[phase.status] ?? 'var(--fg-dim)',
              }}
            >
              {phase.status}
            </span>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {phase.items.map((item) => (
              <li key={item} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: statusColors[phase.status] ?? 'var(--fg-dim)', flexShrink: 0 }}>
                  {phase.status === 'shipped' ? '✓' : '·'}
                </span>
                <span style={{ fontSize: '15px', color: 'var(--fg-mute)', lineHeight: 1.5 }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
