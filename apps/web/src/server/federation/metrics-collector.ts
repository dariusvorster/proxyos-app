import type { MsgMetricsPush } from '@proxyos/federation'
import { getDb } from '@proxyos/db'

export async function handleMetricsPush(msg: MsgMetricsPush): Promise<void> {
  const db = getDb()
  const bucket = Math.floor(msg.timestamp / 60_000) * 60  // truncate to minute

  const sqlite = (db as unknown as { _: { client: { prepare: (s: string) => { run: (...a: unknown[]) => void } } } })?._?.client
  if (!sqlite) return

  const stmt = sqlite.prepare(`
    INSERT INTO agent_metrics (agent_id, route_id, bucket, req_count, error_count, p95_ms, bytes_in, bytes_out)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (agent_id, route_id, bucket) DO UPDATE SET
      req_count = req_count + excluded.req_count,
      error_count = error_count + excluded.error_count,
      p95_ms = excluded.p95_ms,
      bytes_in = bytes_in + excluded.bytes_in,
      bytes_out = bytes_out + excluded.bytes_out
  `)

  for (const [routeId, m] of Object.entries(msg.routes)) {
    stmt.run(
      msg.agentId,
      routeId,
      bucket,
      Math.round(m.reqPerMin),
      Math.round(m.reqPerMin * m.errorRate),
      m.p95LatencyMs,
      m.bytesIn,
      m.bytesOut,
    )
  }
}
