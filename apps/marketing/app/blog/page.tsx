import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ProxyOS Blog',
  description: 'Articles, release posts, and deep-dives on reverse proxying, Caddy, SSO, and the homelab.',
};

const posts = [
  { title: 'ProxyOS v1 launch — the story', date: '2026-04-01', slug: 'v1-launch' },
  { title: 'Benchmarks: ProxyOS vs NPM vs Traefik on route activation latency', date: '2026-04-08', slug: 'benchmarks-route-latency' },
  { title: 'Why we chose Caddy over nginx', date: '2026-03-20', slug: 'why-caddy' },
  { title: 'Under the hood: how we wrap the Caddy Admin API', date: '2026-03-15', slug: 'caddy-admin-api' },
  { title: 'SSO without tears: forward_auth explained', date: '2026-03-10', slug: 'forward-auth-explained' },
  { title: 'The homelab proxy layer — 5 routes for 5 services, visualised', date: '2026-03-05', slug: 'homelab-proxy-layer' },
  { title: 'NPM → ProxyOS: one operator\'s migration story', date: '2026-03-01', slug: 'npm-to-proxyos' },
];

export default function BlogPage() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: '12px' }}>
        Blog
      </h1>
      <p style={{ fontSize: '17px', color: 'var(--fg-mute)', marginBottom: '48px' }}>
        Reverse proxy war stories, Caddy deep-dives, and homelab musings.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {posts.map((post, i) => (
          <div
            key={post.slug}
            style={{
              padding: '20px 0',
              borderBottom: i < posts.length - 1 ? '1px solid var(--border)' : 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: '16px',
            }}
          >
            <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--fg)', lineHeight: 1.4 }}>
              {post.title}
            </h2>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
              {post.date}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
