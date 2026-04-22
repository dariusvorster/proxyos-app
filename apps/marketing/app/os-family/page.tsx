import type { Metadata } from 'next';
import { OSFamilyStrip } from '../../components/OSFamilyStrip';

export const metadata: Metadata = {
  title: 'Homelab OS Family',
  description: 'ProxyOS is part of the Homelab OS Family — a suite of products for homelab operators and small IT teams.',
};

export default function OsFamilyPage() {
  return (
    <>
      <section style={{ padding: '96px 24px 64px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: '20px' }}>
          Homelab OS Family
        </h1>
        <p style={{ fontSize: '17px', color: 'var(--fg-mute)', lineHeight: 1.65, marginBottom: '48px', maxWidth: '560px', margin: '0 auto 48px' }}>
          ProxyOS is one product in a growing family of tools for homelab operators and small IT teams.
          Each product does one thing well. Together, they cover the entire homelab stack.
        </p>
      </section>
      <OSFamilyStrip />
      <section style={{ padding: '64px 24px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ fontSize: '17px', color: 'var(--fg-mute)', lineHeight: 1.65 }}>
          Learn more at{' '}
          <a href="https://homelabos.app" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
            homelabos.app
          </a>
        </p>
      </section>
    </>
  );
}
