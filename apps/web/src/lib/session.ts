export type Session = {
  id: string
  email: string
  role: 'admin' | 'operator' | 'viewer'
  displayName?: string | null
  avatarColor?: string | null
  avatarUrl?: string | null
}

const KEY = 'proxyos_session'

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function setSession(s: Session): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(KEY)
}

export function avatarInitials(s: Session): string {
  const name = s.displayName ?? s.email
  const parts = name.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length >= 2) return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

const AVATAR_PALETTE = [
  '#4338CA', '#0E9F6E', '#B4231F', '#B4600E',
  '#7C6FF0', '#0369A1', '#6D28D9', '#047857',
]

export function defaultAvatarColor(email: string): string {
  let h = 0
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]!
}
