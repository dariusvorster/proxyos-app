'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'proxyos-theme'
export type Theme = 'dark' | 'light'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'dark'
    setTheme(stored)
    document.documentElement.classList.toggle('dark', stored === 'dark')
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    localStorage.setItem(STORAGE_KEY, next)
  }

  return { theme, toggle }
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 16px',
        fontSize: 13,
        fontFamily: 'var(--font-sans)',
        color: 'var(--text3)',
        background: 'transparent',
        border: 0,
        borderRight: '2px solid transparent',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
      }}
    >
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{theme === 'dark' ? '◐' : '◑'}</span>
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </button>
  )
}
