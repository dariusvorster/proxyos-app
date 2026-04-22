'use client';

import { useState } from 'react';

export function BandwidthCalculator() {
  const [requests, setRequests] = useState(100000);
  const [responseKb, setResponseKb] = useState(50);
  const [cachePercent, setCachePercent] = useState(20);

  const uncached = (100 - cachePercent) / 100;
  const gbPerMonth = (requests * responseKb * uncached) / (1024 * 1024);
  const tenX = gbPerMonth * 10;
  const hundredX = gbPerMonth * 100;

  const formatGb = (gb: number) =>
    gb < 1 ? `${(gb * 1024).toFixed(0)} MB` : `${gb.toFixed(1)} GB`;

  const overage = Math.max(0, gbPerMonth - 100);
  const overageCost = overage * 0.05;

  return (
    <div
      style={{
        background: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '32px',
        maxWidth: '700px',
        margin: '0 auto',
      }}
    >
      <h3 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--fg)', marginBottom: '24px' }}>
        Bandwidth calculator
      </h3>

      {/* Sliders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '14px', color: 'var(--fg-mute)' }}>Monthly requests</label>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '13px', color: 'var(--fg)' }}>
              {requests.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min={10000}
            max={10000000}
            step={10000}
            value={requests}
            onChange={(e) => setRequests(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-faint)' }}>10k</span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-faint)' }}>10M</span>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '14px', color: 'var(--fg-mute)' }}>Avg response size</label>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '13px', color: 'var(--fg)' }}>
              {responseKb} KB
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10000}
            step={1}
            value={responseKb}
            onChange={(e) => setResponseKb(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-faint)' }}>1 KB</span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-faint)' }}>10 MB</span>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '14px', color: 'var(--fg-mute)' }}>% cached content</label>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '13px', color: 'var(--fg)' }}>
              {cachePercent}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={cachePercent}
            onChange={(e) => setCachePercent(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-faint)' }}>0%</span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--fg-faint)' }}>100%</span>
          </div>
        </div>
      </div>

      {/* Results */}
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: 'var(--fg-mute)' }}>Estimated bandwidth</span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '16px', fontWeight: 600, color: 'var(--fg)' }}>
              {formatGb(gbPerMonth)}/month
            </span>
          </div>
          <p style={{ fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--fg-dim)' }}>
            {requests.toLocaleString()} req × {responseKb} KB × {((100 - cachePercent) / 100).toFixed(2)} = {formatGb(gbPerMonth)}
          </p>

          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: 'var(--fg-mute)' }}>Solo plan includes</span>
              <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '13px', color: 'var(--fg-mute)' }}>100 GB</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: overage > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                {overage > 0 ? `Overage: ${formatGb(overage)}` : 'Well within Solo plan'}
              </span>
              <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '13px', color: overage > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                {overage > 0 ? `$${overageCost.toFixed(2)}/mo` : '$0'}
              </span>
            </div>
          </div>

          <div
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <p style={{ fontSize: '13px', color: 'var(--fg-dim)' }}>
              If this grows 10×: {formatGb(tenX)}/month
              {tenX <= 100 ? ' — still within Solo.' : tenX <= 1000 ? ' — within Teams (1 TB).' : ' — contact us for Partners pricing.'}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--fg-dim)' }}>
              If this grows 100×: {formatGb(hundredX)}/month
              {hundredX <= 1000 ? ' — within Teams.' : ` — Teams at $29/mo + $${((Math.max(0, hundredX - 1000)) * 0.05).toFixed(0)} overage.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
