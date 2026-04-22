import Link from 'next/link';
import { LogoMark } from './Logo';

const cols = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'vs NPM', href: '/vs-nginx-proxy-manager' },
      { label: 'vs Traefik', href: '/vs-traefik' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Changelog', href: '/changelog' },
      { label: 'Roadmap', href: '/roadmap' },
      { label: 'Status ↗', href: 'https://status.proxyos.app', external: true },
    ],
  },
  {
    heading: 'Cloud',
    links: [
      { label: 'Solo', href: '/cloud' },
      { label: 'Teams', href: '/cloud' },
      { label: 'Partners', href: '/cloud' },
      { label: 'Security', href: '/security' },
      { label: 'Privacy', href: '/legal/privacy' },
      { label: 'DPA', href: '/legal/terms' },
      { label: 'Subprocessors', href: '/legal/terms' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Docs', href: '/vs-nginx-proxy-manager' },
      { label: 'Quickstart', href: '/vs-nginx-proxy-manager' },
      { label: 'API reference', href: '/vs-nginx-proxy-manager' },
      { label: 'Integrations', href: '/features' },
      { label: 'Blog', href: '/blog' },
      { label: 'Caddy API guide', href: '/vs-caddy-file' },
    ],
  },
  {
    heading: 'Community',
    links: [
      { label: 'Discord ↗', href: 'https://discord.gg/proxyos', external: true },
      { label: 'GitHub ↗', href: 'https://github.com/proxyos/proxyos', external: true },
      { label: 'r/selfhosted ↗', href: 'https://reddit.com/r/selfhosted', external: true },
      { label: 'r/homelab ↗', href: 'https://reddit.com/r/homelab', external: true },
      { label: 'Caddy Community ↗', href: 'https://caddy.community', external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer
      style={{
        background: 'var(--bg2)',
        borderTop: '1px solid var(--border)',
        padding: '64px 24px 32px',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '48px',
            marginBottom: '48px',
          }}
        >
          {/* Brand column */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <LogoMark size={28} />
              <span style={{ fontWeight: 600, fontSize: '15px' }}>
                <span style={{ color: 'var(--fg)' }}>Proxy</span>
                <span style={{ color: 'var(--accent)' }}>OS</span>
              </span>
            </div>
            <p style={{ color: 'var(--fg-dim)', fontSize: '13px', lineHeight: 1.6, marginBottom: '16px' }}>
              Reverse proxy that knows your infrastructure.
            </p>
            <p style={{ color: 'var(--fg-faint)', fontSize: '12px' }}>
              © {new Date().getFullYear()} ProxyOS. MIT license.
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <Link href="https://github.com/proxyos/proxyos" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fg-dim)', fontSize: '13px' }}>
                GitHub ↗
              </Link>
            </div>
          </div>

          {/* Nav columns */}
          {cols.map((col) => (
            <div key={col.heading}>
              <p
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '11px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--fg-dim)',
                  marginBottom: '16px',
                }}
              >
                {col.heading}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      style={{ color: 'var(--fg-mute)', fontSize: '13px', transition: 'color 0.15s' }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '12px',
              color: 'var(--fg-faint)',
              textAlign: 'center',
            }}
          >
            proxyos.app · Part of the Homelab OS Family · Built on Caddy, polished by operators.
          </p>
        </div>
      </div>
    </footer>
  );
}
