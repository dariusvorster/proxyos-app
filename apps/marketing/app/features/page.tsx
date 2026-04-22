import type { Metadata } from 'next';
import { FeatureCard } from '../../components/FeatureCard';

export const metadata: Metadata = {
  title: 'ProxyOS Features — Full feature index',
  description:
    'Native Caddy JSON API, automatic HTTPS, SSO toggle, health checks, rate limiting, analytics, and more. All built in.',
};

const featureGroups = [
  {
    category: 'Core routing',
    features: [
      { tag: 'ADMIN API', title: 'Routes go live in under 50ms.', body: 'ProxyOS speaks Caddy\'s JSON Admin API directly. No Caddyfile templates, no reloads, no config regeneration lag. Change a route — it\'s active instantly.' },
      { tag: 'EXPOSE WIZARD', title: 'Source to TLS in 30 seconds.', body: 'Step-by-step wizard: source IP:port → domain → TLS mode → access → options → review. Pushes Caddy config via Admin API. Shows cert provisioning live.' },
      { tag: 'HTTP/3', title: 'QUIC on by default.', body: 'HTTP/3 enabled for all routes without configuration. Falls back to HTTP/2 and HTTP/1.1 automatically.' },
      { tag: 'WEBSOCKETS', title: 'WebSocket routing just works.', body: 'WebSocket and SSE routes configured without special flags. Works with Zulip, Jellyfin, Home Assistant, and anything else that uses long-lived connections.' },
    ],
  },
  {
    category: 'TLS',
    features: [
      { tag: 'AUTO (HTTP-01)', title: "Let's Encrypt and ZeroSSL.", body: 'Public domain, port 80 reachable → ProxyOS provisions and renews automatically. Zero config.' },
      { tag: 'DNS-01', title: 'Private and wildcard domains.', body: 'Cloudflare DNS-01 challenge for *.homelabza.com and other private domains. No port 80 required.' },
      { tag: 'INTERNAL CA', title: 'LAN services, no warnings.', body: "Caddy's internal CA issues certs for LAN-only services. Agent trust distributed automatically." },
      { tag: 'CUSTOM / BYO', title: 'Bring your own cert.', body: 'Upload cert + key via UI or mount via volume. ProxyOS tracks expiry and alerts before renewal is due.' },
    ],
  },
  {
    category: 'SSO & access',
    features: [
      { tag: 'AUTHENTIK', title: 'forward_auth generated for you.', body: 'Toggle SSO on a route, pick Authentik, save. ProxyOS generates the Caddy forward_auth handler — correct headers, correct matcher order.' },
      { tag: 'AUTHELIA', title: 'Same toggle, second provider.', body: 'Same one-switch UX for Authelia. Different forward_auth config generated automatically.' },
      { tag: 'IP ALLOWLIST', title: 'Per-route IP restrictions.', body: 'Add CIDR ranges per route. Combined with SSO or used standalone.' },
      { tag: 'RATE LIMITING', title: 'Limit by IP or header.', body: 'Rate limit any route by request origin or any header value. Applied before SSO in the handler chain.' },
    ],
  },
  {
    category: 'Analytics & observability',
    features: [
      { tag: 'TRAFFIC', title: '1m / 1h / 1d buckets.', body: 'Caddy access logs parsed into SQLite. Per route: req rate, p95 latency, status code breakdown, top clients. All local.' },
      { tag: 'LIVE TAIL', title: 'Request stream on demand.', body: 'Watch requests flow in real time. Method, path, status, latency. Filter by route or client.' },
      { tag: 'ALERTS', title: 'Every problem surfaced.', body: 'Alerts on upstream_down, cert_expiring, error_rate_spike. Delivery via email, Slack, Discord, or generic webhook.' },
      { tag: 'AUDIT LOG', title: 'Hash-chained change history.', body: 'Every route change, cert renewal, and SSO config update logged. Tamper-evident via hash chain.' },
    ],
  },
  {
    category: 'Health & reliability',
    features: [
      { tag: 'HEALTH CHECKS', title: 'Know when an upstream is down.', body: 'Per-route health probes (HTTP, TCP, or custom). Dashboard shows upstream status live.' },
      { tag: 'COMPRESSION', title: 'Gzip and Zstd per route.', body: 'Toggle compression on any route. Zstd preferred, Gzip fallback. Reduces bandwidth for analytics-heavy dashboards.' },
      { tag: 'SQLITE SOURCE', title: 'Never edit a config file.', body: 'SQLite is the authoritative source. ProxyOS rebuilds Caddy state on every restart from the database.' },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: '16px' }}>
        Full feature index
      </h1>
      <p style={{ fontSize: '18px', color: 'var(--fg-mute)', marginBottom: '64px', lineHeight: 1.6, maxWidth: '600px' }}>
        Everything ProxyOS does. Built on Caddy&apos;s Admin API. No Caddyfile. No reloads. No config files.
      </p>

      {featureGroups.map((group) => (
        <div key={group.category} style={{ marginBottom: '56px' }}>
          <h2
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '12px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--accent)',
              marginBottom: '20px',
            }}
          >
            // {group.category.toLowerCase()}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {group.features.map((f) => (
              <FeatureCard key={f.tag} tag={f.tag} title={f.title} body={f.body} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
