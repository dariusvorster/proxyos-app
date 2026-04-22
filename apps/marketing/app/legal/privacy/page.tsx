import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — ProxyOS',
  description: 'ProxyOS privacy policy.',
};

export default function PrivacyPage() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: '760px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: '12px' }}>
        Privacy Policy
      </h1>
      <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-dim)', marginBottom: '40px' }}>
        Last updated: 2026-04-01
      </p>
      {[
        {
          title: 'Self-hosted ProxyOS',
          body: 'Self-hosted ProxyOS stores all data locally. No telemetry is sent to ProxyOS servers. Your routes, traffic data, and analytics never leave your infrastructure.',
        },
        {
          title: 'ProxyOS Cloud',
          body: 'ProxyOS Cloud stores dashboard configuration and — for Model A — request metadata. Request bodies are never stored. Analytics retention follows your plan tier. Data residency: EU or US per your selection.',
        },
        {
          title: 'Contact',
          body: 'privacy@proxyos.app',
        },
      ].map((section) => (
        <div key={section.title} style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--fg)', marginBottom: '10px' }}>{section.title}</h2>
          <p style={{ fontSize: '16px', color: 'var(--fg-mute)', lineHeight: 1.7, margin: 0 }}>{section.body}</p>
        </div>
      ))}
    </section>
  );
}
