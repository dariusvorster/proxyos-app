'use client'

import { useState } from 'react'
import { trpc } from '~/lib/trpc'
import { getSession } from '~/lib/session'

const TIER = (process.env.NEXT_PUBLIC_PROXYOS_TIER ?? 'homelab') as 'homelab' | 'cloud'

const PLANS = [
  {
    key: 'solo',
    name: 'Solo',
    price: 9,
    annualPrice: 90,
    description: 'For individual homelab operators',
    features: [
      'Up to 5 agents',
      '30-day analytics retention',
      'Up to 20 route templates',
      'API access',
      'Connection integrations',
    ],
  },
  {
    key: 'teams',
    name: 'Teams',
    price: 29,
    annualPrice: 290,
    description: 'For teams and power users',
    features: [
      'Unlimited agents',
      '90-day analytics retention',
      'Unlimited route templates',
      'API access',
      'Team management',
      'Priority support',
    ],
  },
] as const

function statusBadge(status: string): { label: string; color: string } {
  switch (status) {
    case 'active': return { label: 'Active', color: 'var(--green, #4ade80)' }
    case 'on_trial': return { label: 'Trial', color: 'var(--accent)' }
    case 'past_due': return { label: 'Past due', color: '#f59e0b' }
    case 'cancelled': return { label: 'Cancelled', color: 'var(--text3)' }
    case 'expired': return { label: 'Expired', color: '#ef4444' }
    default: return { label: status, color: 'var(--text3)' }
  }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function BillingPage() {
  const session = getSession()
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')
  const [licenceKey, setLicenceKey] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [licenceError, setLicenceError] = useState('')
  const [licenceSuccess, setLicenceSuccess] = useState('')

  const subQuery = trpc.billing.getSubscription.useQuery(undefined, { retry: false })
  const trialQuery = trpc.billing.getTrialSubscription.useQuery(undefined, { retry: false })
  const licenceQuery = trpc.billing.getLicence.useQuery(undefined, { retry: false })
  const eventsQuery = trpc.billing.getEvents.useQuery(undefined, { retry: false })

  const checkoutMut = trpc.billing.createCheckout.useMutation({
    onSuccess(data) {
      window.location.href = data.url
    },
  })

  const activateMut = trpc.billing.activateLicence.useMutation({
    onSuccess(data) {
      setLicenceSuccess(`Licence activated — plan: ${data.plan}`)
      setLicenceKey('')
      setInstanceName('')
      licenceQuery.refetch()
    },
    onError(err) {
      setLicenceError(err.message)
    },
  })

  const deactivateMut = trpc.billing.deactivateLicence.useMutation({
    onSuccess() {
      licenceQuery.refetch()
    },
  })

  const portalQuery = trpc.billing.getPortalUrl.useQuery(
    { lsCustomerId: subQuery.data?.lsCustomerId ?? '' },
    { enabled: !!(subQuery.data?.lsCustomerId) },
  )

  const activeSub = subQuery.data ?? trialQuery.data ?? null
  const currentPlan = activeSub?.plan ?? 'free'
  const badge = activeSub ? statusBadge(activeSub.status) : null

  function handleUpgrade(plan: 'solo' | 'teams') {
    if (!session) return
    checkoutMut.mutate({
      plan,
      interval,
      licenceType: TIER === 'homelab' ? 'sh_pro' : 'cloud',
      userId: session.id,
      email: session.email,
      includeTrial: !activeSub,
    })
  }

  function handleActivateLicence() {
    if (!session || !licenceKey.trim() || !instanceName.trim()) return
    setLicenceError('')
    setLicenceSuccess('')
    activateMut.mutate({
      licenceKey: licenceKey.trim(),
      instanceName: instanceName.trim(),
      userId: session.id,
    })
  }

  const card: React.CSSProperties = {
    background: 'var(--surf)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '20px 24px',
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px', fontFamily: 'var(--font-mono, monospace)' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Billing</h1>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 6 }}>
          Manage your ProxyOS subscription and licence
        </p>
      </div>

      {/* Current plan */}
      <div style={{ ...card, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>CURRENT PLAN</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase' }}>
                {currentPlan}
              </span>
              {badge && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: `1px solid ${badge.color}`,
                  color: badge.color,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {badge.label}
                </span>
              )}
            </div>
            {activeSub && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
                {activeSub.status === 'on_trial' && activeSub.trialEndsAt
                  ? `Trial ends ${formatDate(activeSub.trialEndsAt)}`
                  : `Renews ${formatDate(activeSub.currentPeriodEnd)}`}
                {' · '}
                {activeSub.billingInterval === 'annual' ? 'Annual billing' : 'Monthly billing'}
              </div>
            )}
          </div>

          {activeSub?.lsCustomerPortalUrl || portalQuery.data?.url ? (
            <a
              href={portalQuery.data?.url ?? activeSub?.lsCustomerPortalUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '8px 16px',
                background: 'var(--surf2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              Manage billing →
            </a>
          ) : null}
        </div>
      </div>

      {/* Billing interval toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: 'var(--text3)' }}>Billing:</span>
        {(['monthly', 'annual'] as const).map(i => (
          <button
            key={i}
            onClick={() => setInterval(i)}
            style={{
              padding: '4px 14px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: interval === i ? 'var(--accent)' : 'var(--surf)',
              color: interval === i ? '#fff' : 'var(--text3)',
              fontSize: 12,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {i}
            {i === 'annual' && (
              <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.8 }}>save ~17%</span>
            )}
          </button>
        ))}
      </div>

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 32 }}>
        {PLANS.map(plan => {
          const isCurrentPlan = currentPlan === plan.key
          const displayPrice = interval === 'annual'
            ? Math.round(plan.annualPrice / 12)
            : plan.price

          return (
            <div
              key={plan.key}
              style={{
                ...card,
                border: isCurrentPlan
                  ? '2px solid var(--accent)'
                  : '1px solid var(--border)',
                position: 'relative',
              }}
            >
              {isCurrentPlan && (
                <div style={{
                  position: 'absolute',
                  top: -1,
                  right: 16,
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '0 0 4px 4px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}>
                  Current
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  {plan.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                  {plan.description}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>
                    ${displayPrice}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>/mo</span>
                  {interval === 'annual' && (
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      (${plan.annualPrice}/yr)
                    </span>
                  )}
                </div>
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--accent)', fontSize: 10 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {!isCurrentPlan && TIER === 'cloud' && (
                <button
                  onClick={() => handleUpgrade(plan.key)}
                  disabled={checkoutMut.isPending}
                  style={{
                    width: '100%',
                    padding: '9px 0',
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: checkoutMut.isPending ? 'not-allowed' : 'pointer',
                    opacity: checkoutMut.isPending ? 0.6 : 1,
                  }}
                >
                  {checkoutMut.isPending ? 'Redirecting…' : activeSub ? `Upgrade to ${plan.name}` : `Start free trial`}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Self-hosted licence section */}
      {TIER === 'homelab' && (
        <div style={{ ...card, marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 16px' }}>
            Self-Hosted Licence Key
          </h2>

          {licenceQuery.data ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 13, marginBottom: 16 }}>
                <span style={{ color: 'var(--text3)' }}>Plan</span>
                <span style={{ color: 'var(--text)', textTransform: 'uppercase', fontWeight: 600 }}>
                  {licenceQuery.data.plan}
                </span>
                <span style={{ color: 'var(--text3)' }}>Instance</span>
                <span style={{ color: 'var(--text)' }}>{licenceQuery.data.instanceName}</span>
                <span style={{ color: 'var(--text3)' }}>Status</span>
                <span style={{ color: licenceQuery.data.status === 'active' ? 'var(--green, #4ade80)' : 'var(--text3)' }}>
                  {licenceQuery.data.status}
                </span>
                {licenceQuery.data.lastValidatedAt && (
                  <>
                    <span style={{ color: 'var(--text3)' }}>Last validated</span>
                    <span style={{ color: 'var(--text3)' }}>
                      {formatDate(licenceQuery.data.lastValidatedAt)}
                    </span>
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  if (licenceQuery.data && confirm('Deactivate this licence key?')) {
                    deactivateMut.mutate({ licenceKey: licenceQuery.data.lsLicenceKey })
                  }
                }}
                style={{
                  padding: '7px 14px',
                  background: 'transparent',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Deactivate licence
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>
                Enter your Lemon Squeezy licence key to unlock Pro features for this instance.
              </p>
              <input
                value={licenceKey}
                onChange={e => setLicenceKey(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                style={{
                  padding: '8px 12px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  fontSize: 13,
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              />
              <input
                value={instanceName}
                onChange={e => setInstanceName(e.target.value)}
                placeholder="Instance name (e.g. home-server)"
                style={{
                  padding: '8px 12px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              />
              {licenceError && (
                <div style={{ fontSize: 12, color: '#ef4444', padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 4 }}>
                  {licenceError}
                </div>
              )}
              {licenceSuccess && (
                <div style={{ fontSize: 12, color: 'var(--green, #4ade80)', padding: '6px 10px', background: 'rgba(74,222,128,0.08)', borderRadius: 4 }}>
                  {licenceSuccess}
                </div>
              )}
              <button
                onClick={handleActivateLicence}
                disabled={activateMut.isPending || !licenceKey.trim() || !instanceName.trim()}
                style={{
                  padding: '9px 18px',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: activateMut.isPending ? 'not-allowed' : 'pointer',
                  opacity: activateMut.isPending ? 0.6 : 1,
                  alignSelf: 'flex-start',
                }}
              >
                {activateMut.isPending ? 'Activating…' : 'Activate licence'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Billing event history */}
      {eventsQuery.data && eventsQuery.data.length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 16px' }}>
            Billing history
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Date', 'Event', 'Plan', 'Amount'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0 0 8px', color: 'var(--text3)', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventsQuery.data.map(ev => (
                <tr key={ev.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--text3)' }}>
                    {formatDate(ev.createdAt)}
                  </td>
                  <td style={{ padding: '8px 12px 8px 0', color: 'var(--text)' }}>
                    {ev.eventType.replace(/_/g, ' ')}
                  </td>
                  <td style={{ padding: '8px 12px 8px 0', color: 'var(--text3)' }}>
                    {ev.planTo ?? ev.planFrom ?? '—'}
                  </td>
                  <td style={{ padding: '8px 0', color: 'var(--text3)' }}>
                    {ev.amountUsdCents ? `$${(ev.amountUsdCents / 100).toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
