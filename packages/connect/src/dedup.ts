/**
 * Alert deduplication — prevents double-alerting when multiple event sources
 * fire for the same underlying issue (e.g. upstream.down + monitor.down).
 *
 * Events for the same routeId+category are suppressed within WINDOW_MS if
 * a prior event of the same category already fired.
 */

const WINDOW_MS = 5 * 60 * 1000   // 5 minutes

type AlertCategory = 'availability' | 'dns' | 'tunnel' | 'cert' | 'anomaly'

const recent = new Map<string, number>()   // `${routeId}:${category}` → timestamp

function key(routeId: string, category: AlertCategory): string {
  return `${routeId}:${category}`
}

/**
 * Returns true if the event should fire (not deduped), false if suppressed.
 * Also records the event so subsequent calls within the window are suppressed.
 */
export function shouldFire(routeId: string, category: AlertCategory): boolean {
  const k = key(routeId, category)
  const last = recent.get(k)
  const now = Date.now()
  if (last && now - last < WINDOW_MS) return false
  recent.set(k, now)
  return true
}

/** Map known event types to their dedup category */
export function eventCategory(eventType: string): AlertCategory | null {
  switch (eventType) {
    case 'upstream.down':
    case 'monitor.down':
      return 'availability'
    case 'dns.out_of_sync':
      return 'dns'
    case 'tunnel.disconnected':
      return 'tunnel'
    case 'cert.expiring':
      return 'cert'
    case 'anomaly.detected':
      return 'anomaly'
    default:
      return null
  }
}
