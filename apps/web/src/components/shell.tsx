'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LogoMark, Wordmark } from './logo'
import { useTheme } from './theme'
import { getSession, clearSession, avatarInitials, defaultAvatarColor, type Session } from '~/lib/session'
import { trpc } from '~/lib/trpc'

type NavItem = { href: string; label: string; icon?: string }
type NavSection = { label?: string; items: NavItem[] }

const navSections: NavSection[] = [
  {
    items: [
      { href: '/', label: 'Dashboard', icon: '◆' },
      { href: '/routes', label: 'Routes', icon: '↗' },
      { href: '/redirect-hosts', label: 'Redirect hosts', icon: '↪' },
      { href: '/error-hosts', label: 'Error hosts', icon: '✕' },
      { href: '/streams', label: 'Streams', icon: '⇌' },
      { href: '/analytics', label: 'Analytics', icon: '▤' },
      { href: '/health', label: 'Upstream health', icon: '◉' },
      { href: '/certificates', label: 'Certificates', icon: '◼' },
    ],
  },
  {
    label: 'Federation',
    items: [
      { href: '/agents', label: 'Agents', icon: '◇' },
      { href: '/connections', label: 'Connections', icon: '⇌' },
      { href: '/scanner', label: 'Scanner', icon: '◉' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/import', label: 'Import', icon: '⇣' },
      { href: '/access-lists', label: 'Access lists', icon: '⊘' },
      { href: '/audit', label: 'Audit log', icon: '≡' },
      { href: '/logs', label: 'Logs', icon: '▤' },
      { href: '/logs/operations', label: 'Operations', icon: '◎' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/settings/tenants', label: 'Tenants', icon: '⊞' },
      { href: '/billing', label: 'Billing', icon: '◈' },
      { href: '/docs', label: 'Docs', icon: '?' },
    ],
  },
]

const TIER = (process.env.NEXT_PUBLIC_PROXYOS_TIER ?? 'homelab') as 'homelab' | 'cloud'
const TIER_LABEL = TIER === 'cloud' ? 'cloud' : 'self-hosted'

const AUTH_ROUTES = new Set(['/login', '/register', '/forgot-password'])

function AuthGuard() {
  const router = useRouter()
  useEffect(() => {
    if (!getSession()) router.replace('/login')
  }, [router])
  return null
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  // Auth pages — no shell chrome, no sidebar
  if (AUTH_ROUTES.has(pathname ?? '')) {
    return <>{children}</>
  }

  return (
    <>
      <AuthGuard />
      <div className="proxyos-shell" style={{ display: 'grid', minHeight: '100vh' }}>
        <Sidebar />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>{children}</div>
      </div>
      <div
        className="proxyos-splash"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg)',
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 14,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <LogoMark size={40} />
        <h1 style={{ fontSize: 18, fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>ProxyOS requires a desktop browser</h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', fontFamily: 'var(--font-sans)', maxWidth: 320 }}>
          The ProxyOS dashboard is designed for a minimum viewport width of 1024px. Please open it on a desktop or resize your window.
        </p>
      </div>
    </>
  )
}

function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggle: toggleTheme } = useTheme()
  const [session, setSession_] = useState<Session | null>(null)

  useEffect(() => {
    setSession_(getSession())
  }, [])

  const logoutMut = trpc.users.logout.useMutation()

  function logout() {
    clearSession()
    logoutMut.mutate(undefined, { onSettled: () => router.push('/login') })
  }

  const avatarInitial = session
    ? avatarInitials(session)
    : '?'
  const avatarBg = session?.avatarColor ?? 'var(--accent-dim)'

  return (
    <aside
      className="proxyos-sidebar"
      style={{
        background: 'var(--surf)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      {/* Logo row — NO border-bottom per MxWatch standard */}
      <div
        className="proxyos-logo-row"
        style={{
          padding: '14px 16px 12px',
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
        }}
      >
        <Wordmark />
      </div>

      <TenantSwitcher />

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto' }}>
        {navSections.map((section, i) => (
          <div key={i} style={{ marginBottom: 2 }}>
            {section.label && <SectionLabel label={section.label} />}
            {section.items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </div>
        ))}
      </nav>

      {/* User area — NO border-top, margin-top: auto pushes to bottom */}
      <div
        style={{
          marginTop: 'auto',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        {/* Avatar — left, spans full height */}
        <Link href="/settings/profile" style={{ textDecoration: 'none', flexShrink: 0 }}>
          {session?.avatarUrl ? (
            <img
              src={session.avatarUrl}
              alt="Avatar"
              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: avatarBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--accent-dark)',
              }}
            >
              {avatarInitial}
            </span>
          )}
        </Link>

        {/* Right column: icon buttons on top, name + sub below */}
        <div className="proxyos-nav-label" style={{ flex: 1, minWidth: 0 }}>
          {/* Icon buttons row */}
          <div style={{ display: 'flex', gap: 2, alignItems: 'center', marginBottom: 5 }}>
            <IconBtn onClick={() => router.push('/settings')} label="Settings">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
                <path d="M7 1v1M7 12v1M1 7h1M12 7h1M2.5 2.5l.7.7M10.8 10.8l.7.7M2.5 11.5l.7-.7M10.8 3.2l.7-.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </IconBtn>
            <IconBtn onClick={toggleTheme} label={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              {theme === 'dark' ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.6 2.6l1 1M10.4 10.4l1 1M2.6 11.4l1-1M10.4 3.6l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M12 7.5A5 5 0 1 1 6.5 2a3.5 3.5 0 0 0 5.5 5.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </IconBtn>
            <IconBtn onClick={logout} label="Sign out">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 10v2H2V2h7v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 7h6M10 5l2 2-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconBtn>
          </div>

          {/* Name */}
          <div style={{
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'var(--font-sans)',
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {session ? (session.displayName ?? session.email.split('@')[0]) : '—'}
          </div>

          {/* Sub-line */}
          <div style={{
            fontSize: 11,
            fontFamily: 'var(--font-sans)',
            color: 'var(--text3)',
            marginTop: 1,
          }}>
            {TIER_LABEL} · v3.1
          </div>
        </div>
      </div>
    </aside>
  )
}

const TENANT_KEY = 'proxyos_tenant_id'

function TenantSwitcher() {
  const { data: mine = [] } = trpc.tenants.mine.useQuery()
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setActiveTenantId(typeof localStorage !== 'undefined' ? (localStorage.getItem(TENANT_KEY) ?? null) : null)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (mine.length === 0) return null

  const active = mine.find(t => t.id === activeTenantId) ?? mine[0]

  function select(id: string) {
    localStorage.setItem(TENANT_KEY, id)
    setActiveTenantId(id)
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', margin: '0 10px 8px' }}>
      <button
        onClick={() => mine.length > 1 ? setOpen(o => !o) : undefined}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '6px 10px',
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent-border, var(--border))',
          borderRadius: 7,
          cursor: mine.length > 1 ? 'pointer' : 'default',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {active?.name ?? '—'}
        </span>
        {mine.length > 1 && (
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>⌄</span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 7, zIndex: 50, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {mine.map(t => (
            <button
              key={t.id}
              onClick={() => select(t.id)}
              style={{ width: '100%', display: 'block', padding: '8px 12px', background: t.id === active?.id ? 'var(--accent-dim)' : 'transparent', border: 'none', textAlign: 'left', fontSize: 13, fontFamily: 'var(--font-sans)', color: t.id === active?.id ? 'var(--accent-dark)' : 'var(--text)', cursor: 'pointer' }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 26,
        height: 26,
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        color: 'var(--text3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

const allNavHrefs = new Set(navSections.flatMap((s) => s.items.map((i) => i.href)))

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false
  if (href === '/') return pathname === '/'
  if (pathname === href) return true
  // Only use prefix match when the current path isn't itself a direct nav item
  return pathname.startsWith(href + '/') && !allNavHrefs.has(pathname)
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      className="proxyos-section-label"
      style={{
        fontSize: 10,
        fontWeight: 500,
        fontFamily: 'var(--font-sans)',
        color: 'var(--text3)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        padding: '14px 16px 5px',
      }}
    >
      {label}
    </div>
  )
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className="proxyos-navlink"
      title={item.label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 16px',
        fontSize: 13,
        fontFamily: 'var(--font-sans)',
        color: active ? 'var(--accent-dark)' : 'var(--text2)',
        fontWeight: active ? 500 : 400,
        /* NO border-right — MxWatch standard: background fill only */
        background: active ? 'var(--accent-dim)' : 'transparent',
        transition: 'background 0.1s',
        textDecoration: 'none',
      }}
    >
      {item.icon && (
        <span
          style={{
            fontSize: 12,
            color: active ? 'var(--accent)' : 'var(--text3)',
            width: 15,
            textAlign: 'center',
            flexShrink: 0,
          }}
          aria-hidden
        >{item.icon}</span>
      )}
      <span className="proxyos-nav-label">{item.label}</span>
    </Link>
  )
}

export function Topbar({
  title,
  actions,
  banner,
}: {
  title: string
  actions?: ReactNode
  banner?: ReactNode
}) {
  const [syncTime, setSyncTime] = useState('')
  useEffect(() => {
    if (typeof document !== 'undefined') document.title = `ProxyOS — ${title}`
  }, [title])
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setSyncTime(fmt())
    const id = setInterval(() => setSyncTime(fmt()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <>
      <header
        style={{
          background: 'var(--surf)',
          borderBottom: '1px solid var(--border)',
          height: 'var(--topbar-h)',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', fontSize: 13 }}>
          <span style={{ color: 'var(--text2)' }}>Dashboard</span>
          <span style={{ color: 'var(--text3)' }}>/</span>
          <span style={{ fontWeight: 500, color: 'var(--text)' }}>{title}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {syncTime && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>{syncTime}</span>
            </div>
          )}
          {actions}
        </div>
      </header>
      {banner}
    </>
  )
}

export function PageHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h1 style={{ font: "600 22px/1.3 'Inter', sans-serif", color: 'var(--text)', margin: 0, marginBottom: 4 }}>{title}</h1>
      <p style={{ font: "400 13px/1.5 'Inter', sans-serif", color: 'var(--text2)', margin: 0 }}>{desc}</p>
    </div>
  )
}

export function PageContent({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        background: 'var(--bg)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        flex: 1,
        overflowY: 'auto',
      }}
    >
      {children}
    </main>
  )
}
