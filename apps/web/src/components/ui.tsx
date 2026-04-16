import type { CSSProperties, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react'

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 34,
        height: 20,
        borderRadius: 10,
        border: checked ? 'none' : '1px solid var(--border2)',
        padding: 0,
        background: checked ? 'var(--accent-dark)' : 'var(--surf2)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'transform 0.15s',
          transform: checked ? 'translateX(14px)' : 'none',
        }}
      />
    </button>
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
      <span
        style={{
          width: 15,
          height: 15,
          borderRadius: 4,
          background: checked ? 'var(--accent-dark)' : 'var(--surf2)',
          border: checked ? '1px solid var(--accent-dark)' : '1px solid var(--border2)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.1s',
          flexShrink: 0,
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5L8.5 2.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
      {label && <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>}
    </label>
  )
}

export function ProgressBar({ value, tone = 'green', width }: { value: number; tone?: 'green' | 'amber' | 'red'; width?: number | string }) {
  const fg = tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : 'var(--green)'
  return (
    <div style={{ width: width ?? 72, height: 3, background: 'var(--surf2)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: fg, borderRadius: 2 }} />
    </div>
  )
}

export function AlertBanner({ tone, children, onDismiss }: { tone: 'red' | 'amber'; children: ReactNode; onDismiss?: () => void }) {
  const s = tone === 'red'
    ? { bg: 'var(--red-dim)', border: 'var(--red-border)', color: 'var(--red)' }
    : { bg: 'var(--amber-dim)', border: 'var(--amber-border)', color: 'var(--amber)' }
  return (
    <div style={{
      background: s.bg,
      borderBottom: `1px solid ${s.border}`,
      padding: '10px 20px',
      color: s.color,
      fontSize: 13,
      fontFamily: 'var(--font-sans)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div>{children}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: `1px solid ${s.border}`,
            borderRadius: 8,
            color: s.color,
            cursor: 'pointer',
            padding: '5px 10px',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
          aria-label="Dismiss"
        >✕</button>
      )}
    </div>
  )
}

export function Sparkline({ values, width = 80, height = 20, tone = 'purple' }: { values: number[]; width?: number; height?: number; tone?: 'purple' | 'green' | 'red' | 'amber' }) {
  if (values.length === 0) return <svg width={width} height={height} />
  const max = Math.max(...values, 1)
  const step = width / Math.max(values.length - 1, 1)
  const pts = values.map((v, i) => `${i * step},${height - (v / max) * height}`).join(' ')
  const stroke =
    tone === 'green' ? 'var(--green)' :
    tone === 'red' ? 'var(--red)' :
    tone === 'amber' ? 'var(--amber)' :
    'var(--accent)'
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LineChart({
  series,
  width = 800,
  height = 180,
}: {
  series: { label: string; color: string; values: Array<{ t: number; v: number }> }[]
  width?: number
  height?: number
}) {
  const all = series.flatMap((s) => s.values)
  if (all.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 11 }}>
        No data in window.
      </div>
    )
  }
  const minT = Math.min(...all.map((p) => p.t))
  const maxT = Math.max(...all.map((p) => p.t))
  const maxV = Math.max(...all.map((p) => p.v), 1)
  const pad = { l: 40, r: 10, t: 10, b: 22 }
  const w = width - pad.l - pad.r
  const h = height - pad.t - pad.b
  const x = (t: number) => pad.l + ((t - minT) / Math.max(maxT - minT, 1)) * w
  const y = (v: number) => pad.t + h - (v / maxV) * h

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line key={p} x1={pad.l} x2={pad.l + w} y1={pad.t + h - p * h} y2={pad.t + h - p * h} stroke="var(--border)" strokeWidth={0.5} />
      ))}
      {[0, 0.5, 1].map((p) => (
        <text key={p} x={pad.l - 6} y={pad.t + h - p * h + 3} fontSize={9} fill="var(--text3)" textAnchor="end">
          {Math.round(p * maxV)}
        </text>
      ))}
      {series.map((s) => (
        <polyline
          key={s.label}
          points={s.values.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')}
          fill="none"
          stroke={s.color}
          strokeWidth={1.5}
        />
      ))}
    </svg>
  )
}

export function StepIndicator({ steps, active }: { steps: string[]; active: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16 }}>
      {steps.map((label, i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i === steps.length - 1 ? '0 0 auto' : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: i < active ? 'var(--green)' : i === active ? 'var(--accent-dark)' : 'var(--surf2)',
                color: i <= active ? '#fff' : 'var(--text3)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 500,
                border: i === active ? '2px solid var(--accent)' : 'none',
              }}
            >
              {i < active ? '✓' : i + 1}
            </span>
            <span style={{ fontSize: 11, color: i === active ? 'var(--text)' : 'var(--text3)', fontWeight: i === active ? 500 : 400 }}>{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 1, background: i < active ? 'var(--green)' : 'var(--border)', margin: '0 12px' }} />
          )}
        </div>
      ))}
    </div>
  )
}

export function SidePanel({ open, onClose, title, children, width = 420 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width,
          background: 'var(--surf)',
          borderLeft: '1px solid var(--border)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
        }}
      >
        <header style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>{children}</div>
      </aside>
    </>
  )
}

export function Card({ children, style, header }: { children: ReactNode; style?: CSSProperties; header?: ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {header && (
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surf2)',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text3)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {header}
        </div>
      )}
      <div style={{ padding: '14px 18px' }}>{children}</div>
    </section>
  )
}

export function StatCard({
  label,
  value,
  sub,
  subTone,
}: {
  label: string
  value: string | number
  sub?: string
  subTone?: 'green' | 'amber' | 'red' | 'muted'
}) {
  const subColor =
    subTone === 'green' ? 'var(--green)' :
    subTone === 'amber' ? 'var(--amber)' :
    subTone === 'red' ? 'var(--red)' :
    'var(--text3)'
  return (
    <div
      style={{
        background: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '16px 18px',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: subColor, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'neutral'

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  const s = badgeStyles(tone)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        padding: '3px 7px',
        borderRadius: 'var(--radius-sm)',
        whiteSpace: 'nowrap',
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
      }}
    >
      {children}
    </span>
  )
}

function badgeStyles(tone: BadgeTone): { bg: string; fg: string; border: string } {
  switch (tone) {
    case 'green':   return { bg: 'var(--green-dim)',  fg: 'var(--green)',      border: 'var(--green-border)' }
    case 'amber':   return { bg: 'var(--amber-dim)',  fg: 'var(--amber)',      border: 'var(--amber-border)' }
    case 'red':     return { bg: 'var(--red-dim)',    fg: 'var(--red)',        border: 'var(--red-border)' }
    case 'blue':    return { bg: 'var(--blue-dim)',   fg: 'var(--blue)',       border: 'var(--blue-border)' }
    case 'purple':  return { bg: 'var(--accent-dim)', fg: 'var(--accent-dark)', border: 'var(--accent-border)' }
    case 'neutral': return { bg: 'var(--surf2)',      fg: 'var(--text2)',      border: 'var(--border2)' }
  }
}

export function Dot({ tone = 'green', size = 7 }: { tone?: 'green' | 'amber' | 'red' | 'neutral'; size?: number }) {
  const color =
    tone === 'green' ? 'var(--green)' :
    tone === 'amber' ? 'var(--amber)' :
    tone === 'red' ? 'var(--red)' :
    'var(--text3)'
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  )
}

type BtnVariant = 'primary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: 'sm' | 'md'
}

export function Button({ variant = 'ghost', size = 'md', style, ...rest }: ButtonProps) {
  const base: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: size === 'sm' ? 12 : 13,
    fontWeight: variant === 'primary' ? 500 : 400,
    padding: size === 'sm' ? '5px 10px' : '7px 16px',
    borderRadius: variant === 'primary' ? 7 : 8,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'background 0.1s, border-color 0.1s',
    lineHeight: 1,
  }
  const variants: Record<BtnVariant, CSSProperties> = {
    primary: { background: 'var(--accent-dark)', color: '#fff', border: 'none' },
    ghost:   { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border2)' },
    danger:  { background: 'transparent', color: 'var(--red)', border: '1px solid var(--red-border)' },
  }
  return <button {...rest} style={{ ...base, ...variants[variant], ...style }} />
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { style, ...rest } = props
  return (
    <input
      {...rest}
      style={{
        background: 'var(--surf2)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        padding: '8px 11px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 13,
        fontFamily: 'var(--font-mono)',
        outline: 'none',
        width: '100%',
        ...style,
      }}
    />
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { style, ...rest } = props
  return (
    <select
      {...rest}
      style={{
        background: 'var(--surf2)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        padding: '8px 11px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 13,
        fontFamily: 'var(--font-mono)',
        outline: 'none',
        width: '100%',
        ...style,
      }}
    />
  )
}

export function DataTable({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 13,
        tableLayout: 'fixed',
        ...style,
      }}
    >
      {children}
    </table>
  )
}

export const th: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text3)',
  textAlign: 'left',
  padding: '9px 14px',
  background: 'var(--surf2)',
  borderBottom: '1px solid var(--border)',
}

export const td: CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
  color: 'var(--text)',
  fontSize: 13,
}
