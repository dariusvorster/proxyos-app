'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import type { SearchEntry } from '../_lib/docs'

export default function DocsSearch({ index }: { index: SearchEntry[] }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const results = query.length >= 2
    ? index.filter(e =>
        e.title.toLowerCase().includes(query.toLowerCase()) ||
        e.excerpt.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : []

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', padding: '0 12px 10px' }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search docs…"
        style={{
          width: '100%',
          padding: '6px 10px',
          fontSize: 12,
          fontFamily: 'var(--font-sans)',
          background: 'var(--surf2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          color: 'var(--text)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% - 2px)',
          left: 12,
          right: 12,
          background: 'var(--surf)',
          border: '1px solid var(--border2)',
          borderRadius: 8,
          zIndex: 100,
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,.2)',
        }}>
          {results.map(r => (
            <Link
              key={r.path}
              href={r.path === 'index' ? '/docs' : `/docs/${r.path}`}
              onClick={() => { setQuery(''); setOpen(false) }}
              style={{ display: 'block', padding: '8px 12px', textDecoration: 'none', borderBottom: '1px solid var(--border)' }}
            >
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
                {r.title}
              </div>
              {r.excerpt && (
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-sans)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.excerpt}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
