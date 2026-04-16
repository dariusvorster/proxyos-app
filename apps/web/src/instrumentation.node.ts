import { resolve } from 'path'
import { bootstrapProxyOs } from '@proxyos/api/bootstrap'
import { startCollector } from '@proxyos/analytics/collector'
import { startEvaluator } from '@proxyos/alerts/evaluator'

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
