'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogoMark } from '~/components/logo'
import { Button, Input } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { getSession, setSession } from '~/lib/session'
import { useErrorHandler } from '@/hooks/useErrorHandler'

export default function RegisterPage() {
  const router = useRouter()
  const [handleError] = useErrorHandler()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const register = trpc.users.register.useMutation({ onError: handleError })

  // Already logged in — skip to dashboard
  useEffect(() => {
    if (getSession()) router.replace('/')
  }, [router])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Passwords do not match'); return }
    try {
      const s = await register.mutateAsync({ email, password, displayName: displayName || undefined })
      setSession({ id: s.id, email: s.email, role: s.role, displayName: s.displayName, avatarColor: s.avatarColor })
      router.push('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32, gap: 10 }}>
          <LogoMark size={44} />
          <div>
            <h1 style={{
              fontSize: 20,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              color: 'var(--text)',
              textAlign: 'center',
              margin: 0,
            }}>
              Create account
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
              First account gets admin access
            </p>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '24px 28px 28px',
        }}>
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                Display name <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span>
              </span>
              <Input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoFocus
                autoComplete="name"
              />
            </label>

            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                Email
              </span>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>

            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                Password <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(min 8 chars)</span>
              </span>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>

            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                Confirm password
              </span>
              <Input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </label>

            {error && (
              <div style={{
                background: 'var(--red-dim)',
                border: '1px solid var(--red-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                fontSize: 12,
                color: 'var(--red)',
                fontFamily: 'var(--font-sans)',
              }}>
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={register.isPending}
              style={{ width: '100%', justifyContent: 'center', padding: '10px 14px', marginTop: 2 }}
            >
              {register.isPending ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </div>

        {/* Footer links */}
        <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 18, fontFamily: 'var(--font-sans)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            Sign in →
          </Link>
        </p>
      </div>
    </div>
  )
}
