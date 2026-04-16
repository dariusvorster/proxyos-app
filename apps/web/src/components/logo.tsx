export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#0D0D1A" />
      <rect x="10" y="10" width="20" height="20" rx="5" fill="#7C6FF0" />
      <rect x="34" y="10" width="20" height="20" rx="5" fill="#534AB7" />
      <rect x="10" y="34" width="20" height="20" rx="5" fill="#534AB7" />
      <rect x="34" y="34" width="20" height="20" rx="5" fill="#9D8FFF" />
      <rect x="28" y="28" width="8" height="8" rx="2" fill="#F0EFFE" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <LogoMark />
      <span
        className="proxyos-wordmark-text"
        style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em', fontFamily: 'var(--font-sans)' }}
      >
        ProxyOS
      </span>
      <span
        className="proxyos-wordmark-badge"
        style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          background: 'var(--surf2)',
          color: 'var(--text3)',
          borderRadius: 4,
          padding: '1px 5px',
        }}
      >
        v3
      </span>
    </div>
  )
}
