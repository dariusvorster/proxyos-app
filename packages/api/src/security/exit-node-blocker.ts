import { createLogger } from '@proxyos/logger'

const logger = createLogger('[api]')

export interface ExitNodeBlockConfig {
  blockTor: boolean
  blockVPN: boolean
  updateIntervalHours: number  // default 24
}

interface Cache {
  torExitNodes: Set<string>
  vpnRanges: string[]
  fetchedAt: number
}

let cache: Cache | null = null

const TOR_EXIT_LIST_URL = 'https://check.torproject.org/torbulkexitlist'
const IPINFO_VPN_URL = 'https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt'

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.text()
}

export async function refreshBlocklists(config: ExitNodeBlockConfig): Promise<void> {
  const now = Date.now()
  const ttl = config.updateIntervalHours * 60 * 60 * 1000

  if (cache && now - cache.fetchedAt < ttl) return

  const torExitNodes = new Set<string>()
  const vpnRanges: string[] = []

  if (config.blockTor) {
    try {
      const text = await fetchText(TOR_EXIT_LIST_URL)
      for (const line of text.split('\n')) {
        const ip = line.trim()
        if (ip && !ip.startsWith('#')) torExitNodes.add(ip)
      }
    } catch (e) {
      logger.warn({ err: e }, 'Failed to fetch Tor list')
    }
  }

  if (config.blockVPN) {
    try {
      const text = await fetchText(IPINFO_VPN_URL)
      for (const line of text.split('\n')) {
        const cidr = line.trim()
        if (cidr && !cidr.startsWith('#')) vpnRanges.push(cidr)
      }
    } catch (e) {
      logger.warn({ err: e }, 'Failed to fetch VPN list')
    }
  }

  cache = { torExitNodes, vpnRanges, fetchedAt: now }
  logger.info({ torExits: torExitNodes.size, vpnRanges: vpnRanges.length }, 'blocklists updated')
}

export function isBlocked(ip: string): boolean {
  if (!cache) return false
  if (cache.torExitNodes.has(ip)) return true
  return false  // CIDR matching omitted (would require ip-cidr library)
}

/**
 * Builds Caddy IP matcher entries from cached blocklists.
 * Returns array of IP/CIDR strings to block.
 */
export function buildBlocklist(): string[] {
  if (!cache) return []
  return [
    ...Array.from(cache.torExitNodes),
    ...cache.vpnRanges,
  ]
}

export function parseExitNodeConfig(json: string | null | undefined): ExitNodeBlockConfig | null {
  if (!json) return null
  try { return JSON.parse(json) as ExitNodeBlockConfig } catch { return null }
}
