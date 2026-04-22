import Link from 'next/link';
import { LogoWordmark } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const navLinks = [
  { href: '/features', label: 'Features' },
  { href: '/vs-nginx-proxy-manager', label: 'Docs' },
  { href: '/cloud', label: 'Cloud' },
  { href: '/pricing', label: 'Pricing' },
];

export function NavBar() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        height: '64px',
        backgroundColor: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '32px',
        }}
      >
        <LogoWordmark />

        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '10px',
            color: 'var(--accent-light)',
            background: 'var(--surf2)',
            padding: '2px 6px',
            borderRadius: '4px',
            letterSpacing: '0.04em',
          }}
        >
          v3.1
        </span>

        <div
          style={{
            width: '1px',
            height: '20px',
            background: 'var(--border)',
          }}
        />

        <nav style={{ display: 'flex', alignItems: 'center', gap: '24px', flex: 1 }}>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                color: 'var(--fg-mute)',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'color 0.15s',
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="https://github.com/proxyos/proxyos"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--fg-mute)',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            GitHub <span style={{ fontSize: '11px' }}>↗</span>
          </Link>

          <ThemeToggle />

          <Link
            href="/"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-fg)',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            Open app →
          </Link>
        </div>
      </div>
    </header>
  );
}
