import { resolve } from 'path'
import { bootstrapProxyOs } from '@proxyos/api/bootstrap'
import { startCollector } from '@proxyos/analytics/collector'
import { startEvaluator } from '@proxyos/alerts/evaluator'

// ── PROXYOS_SECRET validation ─────────────────────────────────────────────────
const DEV_SENTINEL = 'dev-secret-change-me'
const secret = process.env.PROXYOS_SECRET
if (!secret || secret === DEV_SENTINEL) {
  const msg = !secret
    ? '[proxyos] FATAL: PROXYOS_SECRET is not set. Set it to a random 32+ character string.'
    : '[proxyos] FATAL: PROXYOS_SECRET is still the default dev value. Generate a real secret before running in production.'
  if (process.env.NODE_ENV === 'production') {
    console.error(msg)
    process.exit(1)
  } else {
    console.warn('[proxyos] WARNING: PROXYOS_SECRET is not configured — using insecure default. Set it before going to production.')
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const baseConfigPath =
  process.env.CADDY_BASE_CONFIG_PATH ??
  resolve(process.cwd(), '../../caddy/base-config.json')
const accessLogPath = process.env.PROXYOS_ACCESS_LOG ?? '/tmp/proxyos-access.log'

void (async () => {
  try {
    const result = await bootstrapProxyOs(baseConfigPath)
    if (!result.caddyReachable) {
      console.warn(`[proxyos] Caddy not reachable at boot: ${result.error}`)
    } else {
      console.log(
        `[proxyos] Caddy ready — initialConfigLoaded=${result.initialConfigLoaded} routes=${result.routesReplaced}`,
      )
    }
  } catch (err) {
    console.error('[proxyos] bootstrap failed:', err)
  }

  try {
    await startCollector({ logPath: accessLogPath })
    console.log(`[proxyos] analytics collector tailing ${accessLogPath}`)
  } catch (err) {
    console.warn('[proxyos] analytics collector failed to start:', err)
  }

  try {
    await startEvaluator(60_000)
    console.log('[proxyos] alert evaluator running (60s)')
  } catch (err) {
    console.warn('[proxyos] alert evaluator failed to start:', err)
  }

  try {
    const { startFederationServer } = await import('./server/federation/ws-server')
    startFederationServer()
  } catch (err) {
    console.warn('[proxyos] federation server failed to start:', err)
  }
})()
