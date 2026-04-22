import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — ProxyOS',
  description: 'ProxyOS terms of service.',
};

export default function TermsPage() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: '760px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: '12px' }}>
        Terms of Service
      </h1>
      <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-dim)', marginBottom: '40px' }}>
        Last updated: 2026-04-01
      </p>
      <p style={{ fontSize: '16px', color: 'var(--fg-mute)', lineHeight: 1.7 }}>
        ProxyOS self-hosted software is MIT licensed. Use it freely, modify it, distribute it.
        ProxyOS Cloud services are governed by these terms. Full legal terms coming soon — contact
        legal@proxyos.app for the current draft.
      </p>
    </section>
  );
}
