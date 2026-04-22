import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Import from Nginx Proxy Manager — ProxyOS',
  description: 'One-click migration from NPM. Import routes, certs, and access lists. Dry-run before you commit.',
};

export default function FromNpmPage() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: '900px', margin: '0 auto' }}>
      <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-dim)', marginBottom: '16px' }}>
        // migrate from npm
      </p>
      <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: '20px' }}>
        Import from Nginx Proxy Manager
      </h1>
      <p style={{ fontSize: '17px', color: 'var(--fg-mute)', lineHeight: 1.65, marginBottom: '40px' }}>
        ProxyOS can import your NPM routes, certs, and access lists in one step.
        Run in dry-run mode first to see exactly what will be imported before anything changes.
      </p>

      <div style={{ background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px', marginBottom: '32px' }}>
        <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--accent)', marginBottom: '12px' }}>
          CLI import
        </p>
        <pre style={{ margin: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '16px', fontSize: '13px', color: 'var(--fg-mute)' }}>
          {`proxyos import npm \\
  --url https://npm.local \\
  --email admin@example.com \\
  --password yourpassword \\
  --dry-run`}
        </pre>
      </div>

      <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '20px', letterSpacing: '-0.01em' }}>What gets imported</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '40px' }}>
        {[
          { label: 'Routes', items: ['Domain names', 'Upstream IPs and ports', 'TLS mode', 'HTTP → HTTPS redirects'] },
          { label: 'Certificates', items: ["Let's Encrypt certs (re-issued by Caddy)", 'Custom certs (copied directly)', 'Expiry dates preserved for reference'] },
          { label: 'Access controls', items: ['IP allowlists → ProxyOS route-level allowlist', 'Basic auth → ProxyOS basic auth layer'] },
          { label: 'Known limitations', items: ['Custom nginx snippets: manual review needed', 'Stream (TCP/UDP) routes: V1.1', 'Advanced nginx directives: not imported'] },
        ].map((group) => (
          <div key={group.label} style={{ background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)', marginBottom: '12px' }}>{group.label}</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {group.items.map((item) => (
                <li key={item} style={{ fontSize: '13px', color: 'var(--fg-mute)', padding: '4px 0', display: 'flex', gap: '8px' }}>
                  <span style={{ color: 'var(--accent)' }}>·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <Link href="/#install" style={{ padding: '12px 24px', background: 'var(--accent)', borderRadius: '8px', fontSize: '15px', fontWeight: 600, color: 'var(--accent-fg)' }}>
          Install ProxyOS first →
        </Link>
        <Link href="/vs-nginx-proxy-manager" style={{ padding: '12px 24px', background: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '15px', fontWeight: 500, color: 'var(--fg)' }}>
          Full migration guide →
        </Link>
      </div>
    </section>
  );
}
