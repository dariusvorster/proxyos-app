export function HeroDashboard() {
  const routes = [
    { status: 'ok', domain: 'gitbay.dev', upstream: '192.168.69.25:3000', sso: true, tls: 'auto', req24h: '12,847', p95: '18ms' },
    { status: 'ok', domain: 'zulip.homelabza.com', upstream: '192.168.69.13:443', sso: true, tls: 'dns', req24h: '3,421', p95: '42ms' },
    { status: 'pulse', domain: 'mxwatch.app', upstream: '172.17.0.1:8080', sso: false, tls: 'auto', req24h: '1,203', p95: '11ms' },
    { status: 'ok', domain: 'n8n.homelabza.com', upstream: '192.168.69.25:5678', sso: true, tls: 'dns', req24h: '892', p95: '27ms' },
    { status: 'ok', domain: 'homarr.homelabza.com', upstream: '192.168.80.12:7575', sso: false, tls: 'internal', req24h: '540', p95: '8ms' },
  ];

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '900px',
        margin: '0 auto',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}
    >
      {/* Browser chrome */}
      <div
        style={{
          background: 'var(--surf)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#E5484D' }} />
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F5A623' }} />
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00C896' }} />
        </div>
        <div
          style={{
            flex: 1,
            background: 'var(--surf2)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '4px 12px',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '12px',
            color: 'var(--fg-dim)',
          }}
        >
          proxy.homelabza.com
        </div>
      </div>

      {/* Dashboard content */}
      <div style={{ background: 'var(--bg)', padding: '0' }}>
        {/* Table header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 1fr 90px 70px 80px 60px',
            padding: '10px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surf)',
          }}
        >
          {['STATUS', 'DOMAIN', 'UPSTREAM', 'SSO', 'TLS', 'REQ/24H', 'P95'].map((h) => (
            <span
              key={h}
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '10px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--fg-dim)',
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {/* Table rows */}
        {routes.map((r, i) => (
          <div
            key={r.domain}
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 1fr 90px 70px 80px 60px',
              padding: '11px 20px',
              borderBottom: i < routes.length - 1 ? '1px solid var(--border)' : 'none',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                className={r.status === 'pulse' ? 'pulse-dot' : ''}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--ok)',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {r.status === 'pulse' && (
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px', color: 'var(--warn)' }}>
                  pulse
                </span>
              )}
            </div>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg)' }}>
              {r.domain}
            </span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-mute)' }}>
              {r.upstream}
            </span>
            <span style={{ fontSize: '12px', color: r.sso ? 'var(--ok)' : 'var(--fg-faint)' }}>
              {r.sso ? '✓ Auth.' : '—'}
            </span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--accent-light)' }}>
              {r.tls}
            </span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-mute)' }}>
              {r.req24h}
            </span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-mute)' }}>
              {r.p95}
            </span>
          </div>
        ))}

        {/* Analytics mini card */}
        <div
          style={{
            margin: '12px 20px',
            padding: '12px 16px',
            background: 'var(--surf)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-dim)' }}>
              Total traffic · last 24h
            </span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg)' }}>
              47,892 requests
            </span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-mute)' }}>
              2.4 GB out
            </span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--fg-mute)' }}>
              p95 24ms
            </span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', color: 'var(--ok)' }}>
              99.97% success
            </span>
          </div>

          {/* Sparkline */}
          <svg width="120" height="32" viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polyline
              points="0,24 10,20 20,16 30,18 40,12 50,14 60,8 70,12 80,6 90,10 100,8 110,4 120,6"
              stroke="#7C6FF0"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="0,24 10,20 20,16 30,18 40,12 50,14 60,8 70,12 80,6 90,10 100,8 110,4 120,6 120,32 0,32"
              fill="rgba(124,111,240,0.08)"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
