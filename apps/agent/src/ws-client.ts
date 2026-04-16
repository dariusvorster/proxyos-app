import WebSocket from 'ws'
import type { CentralToAgentMsg } from '@proxyos/federation'
import { RECONNECT_BASE_MS, RECONNECT_MAX_MS, HEALTH_REPORT_INTERVAL_MS } from '@proxyos/federation'
import { applyFullConfig, applyDiff } from './caddy-sync'
import { buildMetricsMsg, METRICS_PUSH_INTERVAL_MS } from './metrics'
import { buildHealthReport } from './health'
import { startLogStreamer, stopLogStreamer } from './log-streamer'

const CENTRAL_URL = process.env.CENTRAL_URL ?? 'ws://localhost:7890'
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? ''
const AGENT_ID = process.env.AGENT_ID ?? ''
const CADDY_VERSION = process.env.CADDY_VERSION ?? 'unknown'

let ws: WebSocket | null = null
let metricsInterval: ReturnType<typeof setInterval> | null = null
let healthInterval: ReturnType<typeof setInterval> | null = null
let reconnectDelay = RECONNECT_BASE_MS
let stopping = false

function connect(): void {
  if (stopping) return
  const url = `${CENTRAL_URL}/api/agents/connect?token=${AGENT_TOKEN}`
  ws = new WebSocket(url)

  ws.on('open', () => {
    console.log(`[agent] Connected to Central at ${CENTRAL_URL}`)
    reconnectDelay = RECONNECT_BASE_MS

    // Start metrics push loop
    metricsInterval = setInterval(() => {
      send(buildMetricsMsg(AGENT_ID, CADDY_VERSION))
    }, METRICS_PUSH_INTERVAL_MS)

    // Start health report loop
    healthInterval = setInterval(() => {
      void buildHealthReport(AGENT_ID).then(msg => send(msg))
    }, HEALTH_REPORT_INTERVAL_MS)

    // Start log streamer
    startLogStreamer(AGENT_ID, (msg) => send(msg))
  })

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as CentralToAgentMsg
      void handleMessage(msg)
    } catch { /* ignore malformed */ }
  })

  ws.on('close', () => {
    cleanup()
    scheduleReconnect()
  })

  ws.on('error', (err) => {
    console.error(`[agent] WebSocket error: ${err.message}`)
    cleanup()
    scheduleReconnect()
  })
}

async function handleMessage(msg: CentralToAgentMsg): Promise<void> {
  switch (msg.type) {
    case 'ping':
      send({ type: 'pong' })
      break

    case 'config.full':
      try {
        await applyFullConfig(msg)
        send({ type: 'config.ack', timestamp: msg.timestamp, success: true })
      } catch (err) {
        send({ type: 'config.ack', timestamp: msg.timestamp, success: false,
               error: err instanceof Error ? err.message : String(err) })
      }
      break

    case 'config.diff':
      try {
        await applyDiff(msg)
        send({ type: 'config.ack', timestamp: msg.timestamp, success: true })
      } catch (err) {
        send({ type: 'config.ack', timestamp: msg.timestamp, success: false,
               error: err instanceof Error ? err.message : String(err) })
        // Request full resync if diff failed
        send({ type: 'config.resync_request', agentId: AGENT_ID, reason: 'diff apply failed' })
      }
      break
  }
}

function send(msg: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function cleanup(): void {
  if (metricsInterval) { clearInterval(metricsInterval); metricsInterval = null }
  if (healthInterval) { clearInterval(healthInterval); healthInterval = null }
  stopLogStreamer()
}

function scheduleReconnect(): void {
  if (stopping) return
  console.log(`[agent] Reconnecting in ${reconnectDelay}ms...`)
  setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
    connect()
  }, reconnectDelay)
}

export function startAgent(): void {
  console.log(`[agent] Starting proxyos-agent (id=${AGENT_ID})`)
  connect()

  process.on('SIGTERM', () => {
    stopping = true
    cleanup()
    ws?.close()
    process.exit(0)
  })
}
