import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ProxyOS Security',
  description: 'ProxyOS threat model, defence in depth, TLS details, forward_auth security model, and vulnerability disclosure.',
};

export default function SecurityPage() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: '20px' }}>
        Security
      </h1>
      <p style={{ fontSize: '17px', color: 'var(--fg-mute)', lineHeight: 1.65, marginBottom: '48px' }}>
        ProxyOS is a security-critical component of your infrastructure. Here&apos;s what it protects,
        how it protects it, and what it doesn&apos;t claim to do.
      </p>

      {[
        {
          title: 'Threat model',
          content: [
            'Unauthorized access to backend services — mitigated by SSO + IP allowlist per route',
            'DoS at the route layer — mitigated by rate limiting per route via Caddy',
            'Cert expiry surprises — mitigated by alerting and auto-renewal',
            'Misconfigured routes going live silently — mitigated by audit log',
            'Upstream failures cascading — mitigated by health checks',
          ],
        },
        {
          title: 'Out of scope',
          content: [
            'Application-layer attacks (SQLi, XSS) — that\'s your app\'s responsibility',
            'Targeted attacks on your SSO provider — that\'s your SSO\'s responsibility',
            'Compromised upstream services — ProxyOS routes to them regardless',
          ],
        },
        {
          title: 'Defence in depth',
          content: [
            'Auth: password + TOTP for the ProxyOS dashboard',
            'Mutual TLS between ProxyOS and Caddy Admin API (both bound to localhost)',
            'forward_auth handler order — SSO happens before anything else in the chain',
            'Hash-chained audit log — tamper-evident',
            'Isolation: ProxyOS never exposes the Caddy Admin API (port 2019) publicly',
          ],
        },
        {
          title: 'TLS',
          content: [
            'TLS 1.3 default, 1.2 fallback available',
            "Cipher suite selection: Caddy's secure defaults",
            'OCSP stapling enabled',
            'HSTS header with preload on auto-TLS routes',
            'Certificate transparency logs respected',
          ],
        },
        {
          title: 'Vulnerability disclosure',
          content: [
            'Email: security@proxyos.app',
            '90-day responsible disclosure window',
            'PGP key available on /security/pgp',
            'Bug bounty: credit-only at V1, monetary rewards at V1.1+',
          ],
        },
      ].map((section) => (
        <div key={section.title} style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--fg)', marginBottom: '16px', letterSpacing: '-0.01em' }}>
            {section.title}
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {section.content.map((item) => (
              <li key={item} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--accent)', flexShrink: 0 }}>·</span>
                <span style={{ fontSize: '15px', color: 'var(--fg-mute)', lineHeight: 1.6 }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
