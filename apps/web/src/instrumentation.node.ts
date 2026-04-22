import { resolve } from 'path'
import { bootstrapProxyOs } from '@proxyos/api/bootstrap'
import { startCollector } from '@proxyos/analytics/collector'
import { startEvaluator } from '@proxyos/alerts/evaluator'
import { createLogger } from '@proxyos/logger'

const logger = createLogger('[web]')

// ── PROXYOS_SECRET validation ─────────────────────────────────────────────────
const DEV_SENTINEL = 'dev-secret-change-me'
const secret = process.env.PROXYOS_SECRET
if (!secret || secret === DEV_SENTINEL) {
  const msg = !secret
    ? '[proxyos] FATAL: PROXYOS_SECRET is not set. Set it to a random 32+ character string.'
    : '[proxyos] FATAL: PROXYOS_SECRET is still the default dev value. Generate a real secret before running in production.'
  if (process.env.NODE_ENV === 'production') {
    logger.fatal(msg)
    process.exit(1)
  } else {
    logger.warn('PROXYOS_SECRET is not configured — using insecure default. Set it before going to production.')
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
      logger.warn({ error: result.error }, 'Caddy not reachable at boot')
    } else {
      logger.info(
        { initialConfigLoaded: result.initialConfigLoaded, routes: result.routesReplaced },
        'Caddy ready',
      )
    }
  } catch (err) {
    logger.error({ err }, 'bootstrap failed')
  }

  try {
    await startCollector({ logPath: accessLogPath })
    logger.info({ logPath: accessLogPath }, 'analytics collector tailing access log')
  } catch (err) {
    logger.warn({ err }, 'analytics collector failed to start')
  }

  try {
    await startEvaluator(60_000)
    logger.info('alert evaluator running (60s)')
  } catch (err) {
    logger.warn({ err }, 'alert evaluator failed to start')
  }

  const mode = (process.env.PROXYOS_MODE ?? 'standalone').toLowerCase()
  const modes = new Set(mode.split('+').map((m) => m.trim()))

  if (!process.env.PROXYOS_MODE && process.env.PROXYOS_CENTRAL_URL && process.env.PROXYOS_AGENT_TOKEN) {
    logger.warn('PROXYOS_MODE not set but CENTRAL_URL+TOKEN present — assuming node mode')
    modes.add('node')
  }

  logger.info({ mode: [...modes].join('+') }, 'starting')

  if (modes.has('central') || modes.has('standalone')) {
    try {
      const { startFederationServer } = await import('@proxyos/federation/server')
      await startFederationServer(Number(process.env.PROXYOS_FEDERATION_PORT ?? 7890))
      logger.info('federation server started')
    } catch (err) {
      logger.warn({ err }, 'federation server failed to start')
    }
  }

  if (modes.has('node')) {
    try {
      const { FederationClient } = await import('@proxyos/federation/client')
      const os = await import('os')
      const { networkDiscoveryService } = await import('@proxyos/api/automation/network-join')
      const client = new FederationClient({
        centralUrl: process.env.PROXYOS_CENTRAL_URL!,
        agentToken: process.env.PROXYOS_AGENT_TOKEN,
        agentName: process.env.PROXYOS_AGENT_NAME ?? os.hostname(),
        caCert: process.env.PROXYOS_CA_CERT,
        tlsSkipVerify: process.env.PROXYOS_TLS_SKIP_VERIFY === 'true',
        identityPath: process.env.PROXYOS_IDENTITY_PATH ?? '/data/proxyos/identity.json',
        reconnectDelayS: Number(process.env.PROXYOS_RECONNECT_DELAY ?? 1),
        maxReconnectDelayS: Number(process.env.PROXYOS_MAX_RECONNECT_DELAY ?? 60),
        heartbeatIntervalS: Number(process.env.PROXYOS_HEARTBEAT_INTERVAL ?? 30),
        welcomeTimeoutS: Number(process.env.PROXYOS_WELCOME_TIMEOUT ?? 30),
        onRescan: () => void networkDiscoveryService.syncOnce().catch((e: unknown) => logger.warn({ err: e }, 'federation rescan failed')),
      })
      await client.start()
      const { setFederationClient } = await import('@proxyos/federation/client')
      setFederationClient(client)
      logger.info('federation client started')
    } catch (err) {
      logger.fatal({ err }, 'federation client failed to start')
      process.exit(1)
    }
  }
})()
