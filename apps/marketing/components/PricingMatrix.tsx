type CellValue = string | boolean | null;

interface MatrixRow {
  feature: string;
  selfHosted: CellValue;
  solo: CellValue;
  teams: CellValue;
  partners: CellValue;
  category?: string;
}

function Cell({ value }: { value: CellValue }) {
  if (value === true) return <span style={{ color: 'var(--ok)' }}>✓</span>;
  if (value === false) return <span style={{ color: 'var(--fg-faint)' }}>—</span>;
  if (value === null) return <span style={{ color: 'var(--fg-faint)' }}>—</span>;
  return <span style={{ fontSize: '13px', color: 'var(--fg-mute)' }}>{value}</span>;
}

const rows: MatrixRow[] = [
  { category: 'Core routing', feature: 'Routes', selfHosted: 'Unlimited', solo: '10', teams: 'Unlimited', partners: 'Unlimited' },
  { feature: 'HTTP/3 (QUIC)', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'WebSocket routing', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'Rate limiting per route', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'Compression (Gzip + Zstd)', selfHosted: true, solo: true, teams: true, partners: true },
  { category: 'TLS', feature: 'Auto HTTPS (HTTP-01)', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'DNS-01 (private/wildcard)', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'Internal CA (LAN only)', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'Custom / BYO cert', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'Cert expiry alerting', selfHosted: true, solo: true, teams: true, partners: true },
  { category: 'SSO', feature: 'Authentik', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'Authelia', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'Keycloak (V1.1)', selfHosted: 'V1.1', solo: false, teams: 'V1.1', partners: 'V1.1' },
  { feature: 'Zitadel (V1.1)', selfHosted: 'V1.1', solo: false, teams: 'V1.1', partners: 'V1.1' },
  { category: 'Analytics', feature: 'Per-route traffic analytics', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'Retention', selfHosted: 'Local / unlimited', solo: '30 days', teams: '1 year', partners: '7 years' },
  { feature: 'Live tail', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'Prometheus export (V1.1)', selfHosted: 'V1.1', solo: false, teams: 'V1.1', partners: 'V1.1' },
  { category: 'Health & reliability', feature: 'Upstream health checks', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'Alerts (email, Slack, Discord)', selfHosted: true, solo: true, teams: true, partners: true },
  { feature: 'Audit log', selfHosted: true, solo: '30 days', teams: '1 year', partners: '7 years' },
  { category: 'Users & access', feature: 'Users', selfHosted: 'Unlimited', solo: '1', teams: '10 included', partners: 'Unlimited' },
  { feature: 'RBAC', selfHosted: true, solo: false, teams: 'Basic', partners: 'Advanced' },
  { feature: 'API access', selfHosted: true, solo: true, teams: true, partners: true },
  { category: 'Support', feature: 'Channel', selfHosted: 'Community', solo: '—', teams: 'Business hrs', partners: '24/7' },
  { feature: 'SLA', selfHosted: null, solo: null, teams: '4h', partners: '1h' },
];

export function PricingMatrix() {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '10px',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
          background: 'var(--surf)',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: '64px',
        }}
      >
        {['Feature', 'Self-hosted', 'Solo', 'Teams', 'Partners'].map((h) => (
          <span
            key={h}
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '11px',
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

      {rows.map((row, i) => {
        if (row.category) {
          return (
            <div key={`cat-${row.category}`}>
              <div
                style={{
                  padding: '10px 20px',
                  background: 'var(--surf2)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '11px',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--accent)',
                  }}
                >
                  {row.category}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                  padding: '12px 20px',
                  borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '14px', color: 'var(--fg)' }}>{row.feature}</span>
                <Cell value={row.selfHosted} />
                <Cell value={row.solo} />
                <Cell value={row.teams} />
                <Cell value={row.partners} />
              </div>
            </div>
          );
        }

        return (
          <div
            key={row.feature}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
              padding: '12px 20px',
              borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
              background: i % 2 === 0 ? 'transparent' : 'var(--surf)',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '14px', color: 'var(--fg)' }}>{row.feature}</span>
            <Cell value={row.selfHosted} />
            <Cell value={row.solo} />
            <Cell value={row.teams} />
            <Cell value={row.partners} />
          </div>
        );
      })}
    </div>
  );
}
