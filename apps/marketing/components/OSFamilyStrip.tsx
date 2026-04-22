const products = [
  { name: 'ProxyOS', href: '/', highlighted: true, desc: 'Reverse proxy' },
  { name: 'BackupOS', href: 'https://backupos.app', highlighted: false, desc: 'Backup management' },
  { name: 'InfraOS', href: 'https://infraos.app', highlighted: false, desc: 'Infrastructure' },
  { name: 'MxWatch', href: 'https://mxwatch.app', highlighted: false, desc: 'Mail monitoring' },
  { name: 'LockBoxOS', href: 'https://lockboxos.app', highlighted: false, desc: 'Secrets vault' },
  { name: 'AccessOS', href: 'https://accessos.app', highlighted: false, desc: 'Access control' },
  { name: 'PatchOS', href: 'https://patchos.app', highlighted: false, desc: 'Patch management' },
];

export function OSFamilyStrip() {
  return (
    <section
      style={{
        background: 'var(--bg2)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        padding: '32px 24px',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <p
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '11px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--fg-dim)',
            textAlign: 'center',
            marginBottom: '20px',
          }}
        >
          // homelab os family
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          {products.map((p, i) => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <a
                href={p.href}
                target={p.highlighted ? undefined : '_blank'}
                rel={p.highlighted ? undefined : 'noopener noreferrer'}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '12px 20px',
                  borderRadius: '8px',
                  border: `1px solid ${p.highlighted ? 'var(--accent)' : 'var(--border)'}`,
                  background: p.highlighted ? 'var(--accent-dim)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'border-color 0.15s',
                  gap: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: p.highlighted ? 'var(--accent-light)' : 'var(--fg-mute)',
                  }}
                >
                  {p.name}
                </span>
                <span
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '10px',
                    color: 'var(--fg-faint)',
                  }}
                >
                  {p.desc}
                </span>
              </a>
              {i < products.length - 1 && (
                <span style={{ color: 'var(--border2)', fontSize: '18px', lineHeight: 1 }}>·</span>
              )}
            </div>
          ))}
        </div>
        <p
          style={{
            textAlign: 'center',
            marginTop: '16px',
          }}
        >
          <a
            href="https://homelabos.app"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '13px', color: 'var(--fg-dim)', textDecoration: 'none' }}
          >
            Visit homelabos.app →
          </a>
        </p>
      </div>
    </section>
  );
}
