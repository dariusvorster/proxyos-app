import { randomUUID } from 'crypto'
import type { FederationClient } from './client'

let timer: ReturnType<typeof setInterval> | null = null

export function startHeartbeat(client: FederationClient, intervalS: number): void {
  stopHeartbeat()
  timer = setInterval(() => {
    client.send({
      type: 'telemetry.heartbeat',
      request_id: randomUUID(),
      payload: {
        routes_active: 0,
        requests_since_last: 0,
        errors_since_last: 0,
        caddy_ok: true,
        docker_ok: true,
        mem_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        cpu_pct: 0,
      },
    })
  }, intervalS * 1000)
}

export function stopHeartbeat(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
