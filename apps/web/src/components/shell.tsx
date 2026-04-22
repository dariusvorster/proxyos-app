'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LogoMark, Wordmark } from './logo'
import { useTheme } from './theme'
import { getSession, clearSession, avatarInitials, defaultAvatarColor, type Session } from '~/lib/session'
import { useSiteSelection } from '~/lib/site-context'
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
      { href: '/alerts', label: 'Alerts', icon: '◈' },
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
      { href: '/containers', label: 'Containers', icon: '⬡' },
      { href: '/docs/setup-guide', label: 'Setup Guide', icon: '?' },
      { href: '/settings/networks', label: 'Docker networks', icon: '⬡' },
      { href: '/settings/upstreams', label: 'Static upstreams', icon: '⇥' },
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

const TIER_LABEL = 'self-hosted'

const AUTH_ROUTES = new Set(['/login', '/register', '/forgot-password'])

function AuthGuard() {
  const router = useRouter()
  useEffect(() => {
    if (!getSession()) router.replace('/login')
  }, [router])
  return null
}

function SiteSelectionGuard() {
  const { data: deployMode } = trpc.system.deploymentMode.useQuery()
  const { setSiteId } = useSiteSelection()
  useEffect(() => {
    if (deployMode && deployMode.mode !== 'central') setSiteId(null)
  }, [deployMode, setSiteId])
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
      <SiteSelectionGuard />
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
  const { data: deployMode } = trpc.system.deploymentMode.useQuery()
  const isCentral = deployMode?.mode === 'central'

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
          <div style={{ display: 'inline-flex', gap: 1, alignItems: 'center', marginBottom: 5, border: '1px solid var(--border)', borderRadius: 8, padding: '3px 4px', background: 'var(--surf)' }}>
            <IconBtn onClick={() => router.push('/settings')} label="Settings">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3" />
                <path d="M7.5 1v1.2M7.5 12.8V14M1 7.5h1.2M12.8 7.5H14M2.8 2.8l.85.85M11.35 11.35l.85.85M2.8 12.2l.85-.85M11.35 3.65l.85-.85" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </IconBtn>
            <IconBtn onClick={toggleTheme} label={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              {theme === 'dark' ? (
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M13 8A5.5 5.5 0 1 1 7 2a4 4 0 0 0 6 6z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.9 2.9l1.05 1.05M11.05 11.05l1.05 1.05M2.9 12.1l1.05-1.05M11.05 3.95l1.05-1.05" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              )}
            </IconBtn>
            <IconBtn onClick={logout} label="Sign out">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M9.5 10.5v2h-7v-10h7v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6.5 7.5h7M11 5.5l2 2-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
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

const SITE_LOCAL = '__local__'

function SiteSwitcher() {
  const { data: sites = [] } = trpc.sites.listAll.useQuery()
  const { siteId, setSiteId } = useSiteSelection()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const activeId = siteId ?? SITE_LOCAL
  const activeName = activeId === SITE_LOCAL
    ? 'This instance'
    : (sites.find(s => s.id === activeId)?.name ?? activeId)

  const options = [
    { id: SITE_LOCAL, name: 'This instance' },
    ...sites.map(s => ({ id: s.id, name: s.name })),
  ]

  function select(id: string) {
    setSiteId(id === SITE_LOCAL ? null : id)
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', margin: '0 10px 4px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '5px 10px',
          background: 'var(--surface2, var(--surf2))',
          border: '1px solid var(--border)',
          borderRadius: 7,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>site</span>
        <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'var(--font-sans)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeName}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>⌄</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 7, zIndex: 50, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={() => select(opt.id)}
              style={{ width: '100%', display: 'block', padding: '8px 12px', background: opt.id === activeId ? 'var(--accent-dim)' : 'transparent', border: 'none', textAlign: 'left', fontSize: 12, fontFamily: 'var(--font-sans)', color: opt.id === activeId ? 'var(--accent-dark)' : 'var(--text)', cursor: 'pointer' }}
            >
              {opt.name}
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

function NodeSelector() {
  const { data: nodes = [] } = trpc.nodes.listAll.useQuery(undefined, { refetchInterval: 10000 })
  const { siteId, setSiteId } = useSiteSelection()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const uniqueSites = Array.from(new Map(nodes.filter(n => n.siteId).map(n => [n.siteId, n])).values())
  const activeName = siteId ? (nodes.find(n => n.siteId === siteId)?.name ?? siteId) : 'This instance'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', background: 'var(--accent-dim)',
          border: '1px solid var(--accent-border, var(--border))',
          borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-sans)',
          fontSize: 12, color: 'var(--accent-dark)',
        }}
      >
        <span style={{ fontSize: 10, opacity: 0.7 }}>instance</span>
        <span style={{ fontWeight: 500 }}>{activeName}</span>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>⌄</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 180,
          background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 7,
          zIndex: 100, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.25)',
        }}>
          <button
            onClick={() => { setSiteId(null); setOpen(false) }}
            style={{ width: '100%', padding: '9px 14px', background: !siteId ? 'var(--accent-dim)' : 'transparent', border: 'none', textAlign: 'left', fontSize: 13, fontFamily: 'var(--font-sans)', color: !siteId ? 'var(--accent-dark)' : 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
            This instance
          </button>
          {uniqueSites.map(n => (
            <button
              key={n.siteId}
              onClick={() => { setSiteId(n.siteId!); setOpen(false) }}
              style={{ width: '100%', padding: '9px 14px', background: siteId === n.siteId ? 'var(--accent-dim)' : 'transparent', border: 'none', textAlign: 'left', fontSize: 13, fontFamily: 'var(--font-sans)', color: siteId === n.siteId ? 'var(--accent-dark)' : 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
              {n.name}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const { data: deployMode } = trpc.system.deploymentMode.useQuery()
  const isCentral = deployMode?.mode === 'central'
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
        {/* Left: breadcrumb + node selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', fontSize: 13 }}>
            <span style={{ color: 'var(--text2)' }}>Dashboard</span>
            <span style={{ color: 'var(--text3)' }}>/</span>
            <span style={{ fontWeight: 500, color: 'var(--text)' }}>{title}</span>
          </div>
          {isCentral && <NodeSelector />}
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
