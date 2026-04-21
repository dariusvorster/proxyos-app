import { readFileSync, existsSync } from 'fs'
import path from 'path'

export const DOCS_DIR =
  process.env.PROXYOS_DOCS_PATH ??
  (process.env.NODE_ENV === 'development'
    ? path.join(process.cwd(), '../../docs')
    : path.join(process.cwd(), 'docs'))

export interface DocPage {
  markdown: string
  title: string
}

function extractTitle(raw: string, fallback: string): string {
  const m = raw.match(/^#\s+(.+)$/m)
  return m?.[1]?.trim() ?? fallback
}

function readDoc(candidates: string[]): string | null {
  for (const c of candidates) {
    if (existsSync(c)) return readFileSync(c, 'utf-8')
  }
  return null
}

export function getDoc(segments: string[]): DocPage | null {
  const joined = segments.join('/')
  const raw = readDoc([
    path.join(DOCS_DIR, `${joined}.md`),
    path.join(DOCS_DIR, joined, 'index.md'),
  ])
  if (!raw) return null
  return { markdown: raw, title: extractTitle(raw, segments[segments.length - 1] ?? 'Docs') }
}

export function getIndexDoc(): DocPage | null {
  const raw = readDoc([path.join(DOCS_DIR, 'index.md')])
  if (!raw) return null
  return { markdown: raw, title: extractTitle(raw, 'Documentation') }
}
