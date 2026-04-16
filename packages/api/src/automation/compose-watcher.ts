import { readFileSync, statSync, watchFile, unwatchFile } from 'node:fs'
import { resolve, join } from 'node:path'

export interface ComposeWatcherConfig {
  projectPath: string
  agentId: string | null
  autoApply: boolean
  watchInterval: number
}

export interface ComposeLabelRoute {
  domain: string
  upstream: string
  tlsMode?: string
  ssoEnabled?: boolean
}

// Parse proxyos.* labels from docker-compose YAML text (no yaml dep — regex-based)
export function parseComposeLabels(yamlText: string): ComposeLabelRoute[] {
  const routes: ComposeLabelRoute[] = []
  // Match label blocks: proxyos.domain, proxyos.upstream, etc.
  const serviceBlocks = yamlText.split(/^  \w+:/m)
  for (const block of serviceBlocks) {
    const domainMatch = block.match(/proxyos\.domain:\s*["']?([^\s"']+)["']?/)
    const upstreamMatch = block.match(/proxyos\.upstream:\s*["']?([^\s"']+)["']?/)
    if (domainMatch && upstreamMatch) {
      const tlsMatch = block.match(/proxyos\.tls[_-]mode:\s*["']?([^\s"']+)["']?/)
      const ssoMatch = block.match(/proxyos\.sso[_-]enabled:\s*["']?(true|false)["']?/)
      routes.push({
        domain: domainMatch[1]!,
        upstream: upstreamMatch[1]!,
        tlsMode: tlsMatch?.[1] ?? 'auto',
        ssoEnabled: ssoMatch?.[1] === 'true',
      })
    }
  }
  return routes
}

export interface WatcherDiff {
  added: ComposeLabelRoute[]
  changed: ComposeLabelRoute[]
  removed: string[]  // domains
}

export function diffRoutes(
  current: ComposeLabelRoute[],
  parsed: ComposeLabelRoute[],
): WatcherDiff {
  const currentMap = new Map(current.map(r => [r.domain, r]))
  const parsedMap = new Map(parsed.map(r => [r.domain, r]))

  const added: ComposeLabelRoute[] = []
  const changed: ComposeLabelRoute[] = []
  const removed: string[] = []

  for (const [domain, route] of parsedMap) {
    const existing = currentMap.get(domain)
    if (!existing) {
      added.push(route)
    } else if (existing.upstream !== route.upstream || existing.tlsMode !== route.tlsMode) {
      changed.push(route)
    }
  }

  for (const domain of currentMap.keys()) {
    if (!parsedMap.has(domain)) removed.push(domain)
  }

  return { added, changed, removed }
}

// Active file watchers — keyed by watcher ID
const activeWatchers = new Map<string, { stop: () => void }>()

export function startWatcher(
  watcherId: string,
  config: ComposeWatcherConfig,
  onDiff: (diff: WatcherDiff, path: string) => void,
): void {
  if (activeWatchers.has(watcherId)) return

  const composePath = join(resolve(config.projectPath), 'docker-compose.yml')
  let lastMtime = 0
  let lastRoutes: ComposeLabelRoute[] = []

  function check() {
    try {
      const stat = statSync(composePath)
      const mtime = stat.mtimeMs
      if (mtime === lastMtime) return
      lastMtime = mtime
      const text = readFileSync(composePath, 'utf-8')
      const parsed = parseComposeLabels(text)
      const diff = diffRoutes(lastRoutes, parsed)
      lastRoutes = parsed
      if (diff.added.length || diff.changed.length || diff.removed.length) {
        onDiff(diff, composePath)
      }
    } catch { /* file may not exist yet */ }
  }

  check()
  const interval = setInterval(check, config.watchInterval * 1000)

  activeWatchers.set(watcherId, {
    stop: () => { clearInterval(interval) },
  })
}

export function stopWatcher(watcherId: string): void {
  activeWatchers.get(watcherId)?.stop()
  activeWatchers.delete(watcherId)
}

export function activeWatcherIds(): string[] {
  return Array.from(activeWatchers.keys())
}
