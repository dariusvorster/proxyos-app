'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Card, Input } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { getSession, setSession, avatarInitials, defaultAvatarColor, type Session } from '~/lib/session'

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
