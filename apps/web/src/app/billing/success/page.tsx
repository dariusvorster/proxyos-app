'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function BillingSuccessPage() {
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) {
          clearInterval(timer)
          window.location.href = '/billing'
          return 0
        }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      fontFamily: 'var(--font-mono, monospace)',
      padding: 24,
      textAlign: 'center',
    }}>
      <div style={{
        background: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '40px 48px',
        maxWidth: 480,
        width: '100%',
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>
          Subscription activated
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 28px', lineHeight: 1.6 }}>
          Your ProxyOS subscription is now active. Features will be unlocked within a few seconds
          as your webhook is processed.
        </p>
        <Link
          href="/billing"
          style={{
            display: 'inline-block',
            padding: '10px 24px',
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Go to billing
        </Link>
        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text3)' }}>
          Redirecting automatically in {countdown}s…
        </p>
      </div>
    </div>
  )
}
