import Link from 'next/link';

export function LogoMark({ size = 32 }: { size?: number }) {
  const scale = size / 48;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="48" height="48" rx="16" fill="#0D0D1A" />
      <rect x="6" y="6" width="16" height="16" rx="2" fill="#7C6FF0" />
      <rect x="26" y="6" width="16" height="16" rx="2" fill="#534AB7" />
      <rect x="6" y="26" width="16" height="16" rx="2" fill="#534AB7" />
      <rect x="26" y="26" width="16" height="16" rx="2" fill="#9D8FFF" />
      <rect x="18" y="18" width="12" height="12" rx="2" fill="#F0EFFE" />
    </svg>
  );
}

export function LogoWordmark() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="ProxyOS home">
      <LogoMark size={28} />
      <span
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 600,
          fontSize: '16px',
          letterSpacing: '-0.02em',
        }}
      >
        <span style={{ color: 'var(--fg)' }}>Proxy</span>
        <span style={{ color: 'var(--accent)' }}>OS</span>
      </span>
    </Link>
  );
}
