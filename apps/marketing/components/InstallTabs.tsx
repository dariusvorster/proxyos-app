'use client';

import { useState } from 'react';

const tabs = [
  {
    id: 'docker',
    label: 'Docker',
    code: `docker run -d --name proxyos \\
  --network host \\
  -v proxyos_data:/data \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  -e PROXYOS_BASE_URL=http://localhost:3000 \\
  ghcr.io/proxyos/proxyos:latest

# Open the dashboard
open http://localhost:3000`,
    lang: 'bash',
    note: 'ProxyOS runs Caddy in the same container. One process, two things. If you prefer to run Caddy separately, see Advanced deployment.',
  },
  {
    id: 'compose',
    label: 'Docker Compose',
    code: `services:
  proxyos:
    image: ghcr.io/proxyos/proxyos:latest
    network_mode: host
    volumes:
      - proxyos_data:/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      PROXYOS_BASE_URL: http://localhost:3000
    restart: unless-stopped
volumes:
  proxyos_data:`,
    lang: 'yaml',
    note: 'ProxyOS runs Caddy in the same container. One process, two things. If you prefer to run Caddy separately, see Advanced deployment.',
  },
  {
    id: 'kubernetes',
    label: 'Kubernetes',
    code: `helm repo add proxyos https://charts.proxyos.app
helm install proxyos proxyos/proxyos \\
  --set baseUrl=https://proxy.homelabza.com`,
    lang: 'bash',
    note: 'Helm chart includes Caddy as a sidecar. RBAC and PVC configured automatically.',
  },
  {
    id: 'baremetal',
    label: 'Bare metal',
    code: `# Debian / Ubuntu
curl -fsSL https://proxyos.app/install.sh | bash

# Starts proxyos.service via systemd.
# Caddy binary bundled, systemd-managed.`,
    lang: 'bash',
    note: 'Tested on Debian 12, Ubuntu 22.04+, Raspberry Pi OS 64-bit.',
  },
];

export function InstallTabs() {
  const [active, setActive] = useState('docker');

  const tab = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          background: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: '8px 8px 0 0',
          padding: '6px 6px 0',
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            style={{
              background: active === t.id ? 'var(--bg)' : 'transparent',
              border: active === t.id ? '1px solid var(--border)' : '1px solid transparent',
              borderBottom: active === t.id ? '1px solid var(--bg)' : '1px solid transparent',
              borderRadius: '6px 6px 0 0',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: active === t.id ? 600 : 400,
              color: active === t.id ? 'var(--fg)' : 'var(--fg-mute)',
              cursor: 'pointer',
              transition: 'color 0.15s',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Code block */}
      <div
        style={{
          background: 'var(--surf)',
          border: '1px solid var(--border)',
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          padding: '20px 24px',
        }}
      >
        <pre
          style={{
            margin: 0,
            background: 'transparent',
            border: 'none',
            padding: 0,
            fontSize: '13px',
            color: 'var(--fg-mute)',
            overflowX: 'auto',
          }}
        >
          <code>{tab.code}</code>
        </pre>
      </div>

      {tab.note && (
        <p
          style={{
            fontSize: '13px',
            color: 'var(--fg-dim)',
            marginTop: '12px',
            lineHeight: 1.6,
          }}
        >
          {tab.note}
        </p>
      )}
    </div>
  );
}
