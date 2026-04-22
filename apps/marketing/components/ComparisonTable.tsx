interface Row {
  feature: string;
  npm: string | boolean | null;
  proxyos: string | boolean | null;
}

interface ComparisonTableProps {
  rows: Row[];
}

function Cell({ value }: { value: string | boolean | null }) {
  if (value === true) return <span style={{ color: 'var(--ok)', fontWeight: 600 }}>✓</span>;
  if (value === false) return <span style={{ color: 'var(--err)' }}>✗</span>;
  if (value === null) return <span style={{ color: 'var(--fg-faint)' }}>—</span>;
  return <span style={{ color: 'var(--fg-mute)', fontSize: '13px' }}>{value}</span>;
}

export function ComparisonTable({ rows }: ComparisonTableProps) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '10px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          background: 'var(--surf)',
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {['Feature', 'Nginx Proxy Manager', 'ProxyOS'].map((h) => (
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
      {rows.map((row, i) => (
        <div
          key={row.feature}
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            padding: '12px 20px',
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
            background: i % 2 === 0 ? 'transparent' : 'var(--surf)',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '14px', color: 'var(--fg)' }}>{row.feature}</span>
          <Cell value={row.npm} />
          <Cell value={row.proxyos} />
        </div>
      ))}
    </div>
  );
}
