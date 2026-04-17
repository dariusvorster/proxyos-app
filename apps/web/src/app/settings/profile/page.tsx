'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Button, Card, Input } from '~/components/ui'

const QRCodeSVG = dynamic(() => import('qrcode.react').then(m => ({ default: m.QRCodeSVG })), { ssr: false })
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { getSession, setSession, avatarInitials, defaultAvatarColor, type Session } from '~/lib/session'

function TotpCard({ userId, enabled, onToggled }: { userId: string; enabled: boolean; onToggled: () => void }) {
  const [step, setStep] = useState<'idle' | 'setup'>('idle')
  const [secret, setSecret] = useState('')
  const [uri, setUri] = useState('')
  const [code, setCode] = useState('')
  const [setupError, setSetupError] = useState<string | null>(null)
  const [showDisable, setShowDisable] = useState(false)
  const [disablePw, setDisablePw] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [disableError, setDisableError] = useState<string | null>(null)

  const setupTotp = trpc.users.setupTotp.useMutation()
  const verifyAndEnable = trpc.users.verifyAndEnableTotp.useMutation()
  const disableTotp = trpc.users.disableTotp.useMutation()

  async function startSetup() {
    setSetupError(null)
    try {
      const res = await setupTotp.mutateAsync({ userId })
      setSecret(res.secret)
      setUri(res.uri)
      setCode('')
      setStep('setup')
    } catch (err: unknown) {
      setSetupError(err instanceof Error ? err.message : 'Failed to generate secret')
    }
  }

  async function verifyCode() {
    setSetupError(null)
    try {
      await verifyAndEnable.mutateAsync({ userId, secret, code })
      setStep('idle')
      onToggled()
    } catch (err: unknown) {
      setSetupError(err instanceof Error ? err.message : 'Invalid code')
    }
  }

  async function doDisable() {
    setDisableError(null)
    try {
      await disableTotp.mutateAsync({ userId, password: disablePw, code: disableCode })
      setDisablePw(''); setDisableCode(''); setShowDisable(false)
      onToggled()
    } catch (err: unknown) {
      setDisableError(err instanceof Error ? err.message : 'Failed to disable 2FA')
    }
  }

  if (enabled) {
    return (
      <Card header={<span>Two-factor authentication</span>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 11, background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid var(--green-border)', borderRadius: 4, padding: '2px 8px' }}>Enabled</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>TOTP authenticator app is protecting your account.</span>
        </div>
        {!showDisable ? (
          <Button variant="danger" onClick={() => setShowDisable(true)}>Disable 2FA</Button>
        ) : (
          <div style={{ display: 'grid', gap: 10, maxWidth: 320 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Enter your password and a current authenticator code to disable 2FA.</div>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Password</span>
              <Input type="password" value={disablePw} onChange={e => setDisablePw(e.target.value)} autoComplete="current-password" />
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Authenticator code</span>
              <Input type="text" inputMode="numeric" maxLength={6} value={disableCode}
                onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000" style={{ letterSpacing: '0.15em', maxWidth: 140 }} />
            </label>
            {disableError && <p style={{ fontSize: 11, color: 'var(--red)', margin: 0 }}>{disableError}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="danger" onClick={doDisable}
                disabled={!disablePw || disableCode.length !== 6 || disableTotp.isPending}>
                {disableTotp.isPending ? 'Disabling…' : 'Confirm disable'}
              </Button>
              <Button onClick={() => { setShowDisable(false); setDisableError(null); setDisablePw(''); setDisableCode('') }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    )
  }

  if (step === 'idle') {
    return (
      <Card header={<span>Two-factor authentication</span>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 11, background: 'var(--surf2)', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px' }}>Not enabled</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Add an extra layer of security with an authenticator app.</span>
        </div>
        {setupError && <p style={{ fontSize: 11, color: 'var(--red)', margin: '0 0 10px' }}>{setupError}</p>}
        <Button variant="primary" onClick={startSetup} disabled={setupTotp.isPending}>
          {setupTotp.isPending ? 'Generating…' : 'Set up authenticator'}
        </Button>
      </Card>
    )
  }

  // step === 'setup'
  return (
    <Card header={<span>Two-factor authentication — Setup</span>}>
      <div style={{ display: 'grid', gap: 14, maxWidth: 400 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.), or enter the secret key manually.
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
          <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid var(--border)', display: 'inline-block', lineHeight: 0 }}>
            <QRCodeSVG value={uri} size={160} />
          </div>
        </div>
        <div style={{ background: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Secret key — manual entry</div>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.12em', color: 'var(--text)', wordBreak: 'break-all' }}>{secret}</code>
        </div>
        <a href={uri} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
          Open in authenticator app →
        </a>
        <label style={{ display: 'grid', gap: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Confirm — enter the 6-digit code from your app
          </span>
          <Input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
            autoComplete="one-time-code"
            placeholder="000000"
            style={{ letterSpacing: '0.2em', textAlign: 'center', fontSize: 18, maxWidth: 160 }}
          />
        </label>
        {setupError && <p style={{ fontSize: 11, color: 'var(--red)', margin: 0 }}>{setupError}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" onClick={verifyCode} disabled={code.length !== 6 || verifyAndEnable.isPending}>
            {verifyAndEnable.isPending ? 'Verifying…' : 'Verify & enable'}
          </Button>
          <Button onClick={() => { setStep('idle'); setCode(''); setSetupError(null) }}>Cancel</Button>
        </div>
      </div>
    </Card>
  )
}

const AVATAR_COLORS = [
  '#4338CA', '#0E9F6E', '#B4231F', '#B4600E',
  '#7C6FF0', '#0369A1', '#6D28D9', '#047857',
  '#9D174D', '#92400E', '#1D4ED8', '#065F46',
]

/** Resize an image file to 128×128 and return a JPEG data URL. */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const size = 128
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      // Cover crop: scale so the shorter side fills the canvas
      const scale = Math.max(size / img.width, size / img.height)
      const sw = img.width * scale
      const sh = img.height * scale
      ctx.drawImage(img, (size - sw) / 2, (size - sh) / 2, sw, sh)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    img.src = url
  })
}

export default function ProfilePage() {
  const router = useRouter()
  const [localSession, setLocalSession] = useState<Session | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/login'); return }
    setLocalSession(s)
    setSessionId(s.id)
  }, [router])

  if (!sessionId || !localSession) {
    return (
      <>
        <Topbar title="My profile" actions={<Link href="/settings" style={{ fontSize: 11, color: 'var(--accent)' }}>← Settings</Link>} />
        <PageContent>
          <div style={{ color: 'var(--text3)', fontSize: 12, padding: '40px 0', textAlign: 'center' }}>Loading profile…</div>
        </PageContent>
      </>
    )
  }

  return <ProfileForm session={localSession} />
}

function ProfileForm({ session }: { session: Session }) {
  const profile = trpc.users.getProfile.useQuery({ id: session.id })
  const updateProfile = trpc.users.updateProfile.useMutation()
  const updatePassword = trpc.users.updatePassword.useMutation()
  const fileRef = useRef<HTMLInputElement>(null)

  const serverData = profile.data
  const [displayName, setDisplayName] = useState(session.displayName ?? '')
  const [avatarColor, setAvatarColor] = useState(session.avatarColor ?? defaultAvatarColor(session.email))
  const [avatarUrl, setAvatarUrl] = useState<string | null>(session.avatarUrl ?? null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (serverData) {
      setDisplayName(serverData.displayName ?? '')
      setAvatarColor(serverData.avatarColor ?? defaultAvatarColor(serverData.email))
      setAvatarUrl(serverData.avatarUrl ?? null)
    }
  }, [serverData])

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)

  const displaySession = serverData ?? session
  const initials = avatarInitials({ ...displaySession, displayName, avatarColor })

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await resizeImage(file)
      setAvatarUrl(dataUrl)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function removeAvatar() {
    setAvatarUrl(null)
  }

  async function saveProfile() {
    await updateProfile.mutateAsync({ id: session.id, displayName: displayName || null, avatarColor, avatarUrl })
    const updated = { ...session, displayName: displayName || null, avatarColor, avatarUrl }
    setSession(updated)
    setProfileSuccess(true)
    setTimeout(() => setProfileSuccess(false), 2000)
    void profile.refetch()
  }

  async function savePassword() {
    setPwError(null)
    setPwSuccess(false)
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
    try {
      await updatePassword.mutateAsync({ id: session.id, currentPassword: currentPw, newPassword: newPw })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setPwSuccess(true)
      setTimeout(() => setPwSuccess(false), 3000)
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Password update failed')
    }
  }

  return (
    <>
      <Topbar
        title="My profile"
        actions={<Link href="/settings" style={{ fontSize: 11, color: 'var(--accent)' }}>← Settings</Link>}
      />
      <PageContent>
        <Card header={<span>Profile</span>}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 16 }}>

            {/* Avatar — image or initials, click to upload */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="Click to upload photo"
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: avatarUrl ? 'transparent' : avatarColor,
                  border: '2px solid var(--border2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  padding: 0,
                  position: 'relative',
                }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '0.02em', fontFamily: 'var(--font-sans)' }}>
                    {initials}
                  </span>
                )}
                {/* Hover overlay */}
                <span style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0, transition: 'opacity 0.15s', fontSize: 10,
                  color: '#fff', fontFamily: 'var(--font-mono)',
                }}
                  className="avatar-upload-overlay"
                >
                  {uploading ? '…' : 'Upload'}
                </span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'var(--font-sans)' }}
                >
                  {avatarUrl ? 'Change' : 'Upload'}
                </button>
                {avatarUrl && (
                  <>
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>·</span>
                    <button
                      onClick={removeAvatar}
                      style={{ fontSize: 10, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'var(--font-sans)' }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Right: email/role + color swatches */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
                {displaySession.email}
                <span style={{ marginLeft: 8, color: 'var(--text3)', textTransform: 'uppercase', fontSize: 10 }}>{displaySession.role}</span>
              </div>

              {!avatarUrl && (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Fallback colour (used when no photo)</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {AVATAR_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setAvatarColor(c)}
                        style={{
                          width: 22, height: 22, borderRadius: '50%', background: c,
                          border: avatarColor === c ? '2px solid var(--text)' : '2px solid transparent',
                          cursor: 'pointer', padding: 0,
                        }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <label style={{ display: 'grid', gap: 5, marginBottom: 14 }}>
            <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Display name</span>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={displaySession.email.split('@')[0]} style={{ maxWidth: 280 }} />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button variant="primary" onClick={saveProfile} disabled={updateProfile.isPending || uploading}>
              {updateProfile.isPending ? 'Saving…' : 'Save profile'}
            </Button>
            {profileSuccess && <span style={{ fontSize: 11, color: 'var(--green)' }}>Saved ✓</span>}
          </div>
        </Card>

        <Card header={<span>Change password</span>}>
          <div style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current password</span>
              <Input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>New password (min 8 chars)</span>
              <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} minLength={8} />
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confirm new password</span>
              <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button variant="primary" onClick={savePassword} disabled={!currentPw || !newPw || updatePassword.isPending}>
                {updatePassword.isPending ? 'Updating…' : 'Update password'}
              </Button>
              {pwSuccess && <span style={{ fontSize: 11, color: 'var(--green)' }}>Updated ✓</span>}
            </div>
            {pwError && <p style={{ fontSize: 11, color: 'var(--red)', margin: 0 }}>{pwError}</p>}
          </div>
        </Card>

        <TotpCard userId={session.id} enabled={!!serverData?.totpEnabled} onToggled={() => void profile.refetch()} />

        <Card header={<span>Account</span>}>
          <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)' }}>Email</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{displaySession.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)' }}>Role</span>
              <span style={{ textTransform: 'capitalize' }}>{displaySession.role}</span>
            </div>
            {serverData?.lastLogin && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text3)' }}>Last login</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{new Date(serverData.lastLogin).toLocaleString()}</span>
              </div>
            )}
            {serverData?.createdAt && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text3)' }}>Member since</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{new Date(serverData.createdAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </Card>
      </PageContent>

      <style>{`
        button:hover .avatar-upload-overlay { opacity: 1 !important; }
      `}</style>
    </>
  )
}
