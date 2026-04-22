import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ProxyOS vs Traefik',
  description: 'ProxyOS vs Traefik — same dynamic config power, database-driven, point-and-click editing.',
};

export default function VsTraefikPage() {
  return (
    <section style={{ padding: '96px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-dim)', marginBottom: '16px' }}>
        // vs traefik
      </p>
      <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: '20px' }}>
        ProxyOS vs Traefik
      </h1>
      <p style={{ fontSize: '17px', color: 'var(--fg-mute)', lineHeight: 1.65, marginBottom: '32px' }}>
        Traefik is excellent for label-driven dynamic config in Docker and Kubernetes. ProxyOS
        is the better choice for homelab services you want to manage through a UI, add SSO to,
        and observe — without writing YAML middleware arrays.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {[
          {
            title: 'Where Traefik shines',
            body: 'Label-driven dynamic config for Docker and Kubernetes. No separate database. Middleware as composable units. Excellent for container-native environments where infra-as-code is the model.',
          },
          {
            title: 'Where it hurts',
            body: 'Label syntax complexity grows fast. No built-in dashboard for non-monitoring operations. Middleware config as YAML arrays requires knowing the exact middleware name and option structure. SSO requires external plugin or ForwardAuth config by hand.',
          },
          {
            title: "ProxyOS's different take",
            body: 'Same dynamic config power, database-driven, point-and-click editing. Same reload speeds (Caddy Admin API is ≤50ms). SSO is a toggle. Analytics built in. Coexist: keep Traefik for K8s ingress, add ProxyOS for homelab and standalone services.',
          },
        ].map((item) => (
          <div
            key={item.title}
            style={{
              background: 'var(--surf)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '24px',
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--fg)', marginBottom: '10px' }}>{item.title}</h3>
            <p style={{ fontSize: '15px', color: 'var(--fg-mute)', lineHeight: 1.65, margin: 0 }}>{item.body}</p>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '40px', display: 'flex', gap: '12px' }}>
        <Link href="/#install" style={{ padding: '12px 24px', background: 'var(--accent)', borderRadius: '8px', fontSize: '15px', fontWeight: 600, color: 'var(--accent-fg)' }}>
          Try ProxyOS →
        </Link>
        <Link href="/pricing" style={{ padding: '12px 24px', background: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '15px', fontWeight: 500, color: 'var(--fg)' }}>
          See pricing →
        </Link>
      </div>
    </section>
  );
}
