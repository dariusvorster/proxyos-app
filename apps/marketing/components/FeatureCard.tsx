interface FeatureCardProps {
  tag: string;
  title: string;
  body: string;
}

export function FeatureCard({ tag, title, body }: FeatureCardProps) {
  return (
    <div
      style={{
        background: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '24px',
        transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = 'var(--accent-ring)';
        el.style.transform = 'translateY(-2px)';
        el.style.boxShadow = '0 8px 32px var(--accent-ring)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = 'var(--border)';
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = 'none';
      }}
    >
      <span
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '10px',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--accent)',
          background: 'var(--accent-dim)',
          padding: '3px 8px',
          borderRadius: '4px',
          display: 'inline-block',
          marginBottom: '14px',
        }}
      >
        {tag}
      </span>
      <h3
        style={{
          fontSize: '16px',
          fontWeight: 600,
          color: 'var(--fg)',
          marginBottom: '10px',
          lineHeight: 1.4,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: '14px',
          color: 'var(--fg-mute)',
          lineHeight: 1.65,
          margin: 0,
        }}
      >
        {body}
      </p>
    </div>
  );
}
