import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
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

export interface SearchEntry {
  path: string
  title: string
  excerpt: string
}

function walkDocs(dir: string, base = ''): SearchEntry[] {
  const entries: SearchEntry[] = []
  if (!existsSync(dir)) return entries
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = base ? `${base}/${name}` : name
    if (statSync(full).isDirectory()) {
      entries.push(...walkDocs(full, rel))
    } else if (name.endsWith('.md')) {
      const docPath = rel.replace(/\.md$/, '').replace(/\/index$/, '')
      const raw = readFileSync(full, 'utf-8')
      const title = extractTitle(raw, name.replace('.md', ''))
      const excerpt = raw
        .split('\n')
        .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('|'))
        .find(l => l.trim().length > 20)
        ?.trim()
        .slice(0, 120) ?? ''
      entries.push({ path: docPath, title, excerpt })
    }
  }
  return entries
}

export function buildSearchIndex(): SearchEntry[] {
  return walkDocs(DOCS_DIR)
}
