'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Script from 'next/script'
import { trpc } from '~/lib/trpc'

function BotChallengePage() {
  const params = useSearchParams()
  const host = params.get('host') ?? ''
  const returnUrl = params.get('returnUrl') ?? '/'
  const [msg, setMsg] = useState('')

  const config = trpc.security.getBotChallengePublicConfig.useQuery({ host }, { enabled: !!host })

  async function onVerified(token: string) {
    setMsg('Verifying…')
    try {
      const res = await fetch('/api/bot-challenge/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, host, returnUrl }),
      })
      if (res.ok) {
        const data = await res.json() as { returnUrl: string }
        window.location.href = data.returnUrl
      } else {
        setMsg('Verification failed — please try again.')
      }
    } catch {
      setMsg('Network error — please try again.')
    }
  }

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as unknown as Record<string, unknown>).onBotChallengeSuccess = onVerified
  })

  const cfg = config.data?.config

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1117', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#e2e8f0' }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: '48px 40px', background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 16 }}>
        <div style={{ width: 48, height: 48, margin: '0 auto 20px', background: '#1e3a5f', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#f1f5f9' }}>Security Check</div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 28, lineHeight: 1.6 }}>
          Please complete the challenge below to continue.
        </div>

        {!cfg && !config.isError && (
          <div style={{ fontSize: 13, color: '#475569' }}>Loading…</div>
        )}

        {cfg?.provider === 'turnstile' && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
            <div
              className="cf-turnstile"
              data-sitekey={cfg.siteKey}
              data-callback="onBotChallengeSuccess"
              data-theme="dark"
              style={{ display: 'flex', justifyContent: 'center' }}
            />
          </>
        )}

        {cfg?.provider === 'hcaptcha' && (
          <>
            <Script src="https://hcaptcha.com/1/api.js" strategy="afterInteractive" />
            <div
              className="h-captcha"
              data-sitekey={cfg.siteKey}
              data-callback="onBotChallengeSuccess"
              data-theme="dark"
              style={{ display: 'flex', justifyContent: 'center' }}
            />
          </>
        )}

        {msg && (
          <div style={{ marginTop: 16, fontSize: 13, color: msg.includes('fail') || msg.includes('error') ? '#f87171' : '#94a3b8' }}>
            {msg}
          </div>
        )}

        <div style={{ marginTop: 28, fontSize: 11, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Powered by ProxyOS
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense>
      <BotChallengePage />
    </Suspense>
  )
}
