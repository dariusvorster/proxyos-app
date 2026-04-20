'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { LogoMark } from '~/components/logo'
import { Button, Input } from '~/components/ui'
import { setSession } from '~/lib/session'

export default function SetupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json() as { id?: string; email?: string; role?: string; error?: string }
      if (!res.ok) { setError(data.error ?? 'Setup failed'); return }
      setSession({ id: data.id!, email: data.email!, role: data.role! as 'admin', displayName: null, avatarColor: null })
      router.push('/')
    } catch {
      setError('Network error — check that the server is reachable')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <LogoMark size={36} />
          <h1 style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--text)', marginTop: 12 }}>Welcome to ProxyOS</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'var(--font-sans)', marginTop: 4, textAlign: 'center' }}>
            Create your admin account to get started.
          </p>
        </div>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <Input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          <Input type="password" placeholder="Password (8+ characters)" value={password} onChange={e => setPassword(e.target.value)} required />
          <Input type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          {error && <div style={{ fontSize: 12, color: 'var(--red)', fontFamily: 'var(--font-sans)' }}>{error}</div>}
          <Button variant="primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? 'Creating account…' : 'Create admin account'}
          </Button>
        </form>
      </div>
    </div>
  )
}
