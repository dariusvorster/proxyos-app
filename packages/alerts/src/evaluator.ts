import { and, eq, gte } from 'drizzle-orm'
import {
  alertEvents,
  alertRules,
  certificates,
  getDb,
  nanoid,
  trafficMetrics,
} from '@proxyos/db'
import type { AlertRule, AlertRuleConfig, AlertType } from '@proxyos/types'
import { sendAlertNotifications } from './notify'

const DEFAULT_COOLDOWN_MINUTES = 15

export interface EvalResult {
  checked: number
  fired: number
}

export async function startEvaluator(intervalMs = 60_000): Promise<{ stop: () => void }> {
  let stopped = false
  const tick = async () => {
    if (stopped) return
    try {
      await evaluateOnce()
    } catch (err) {
      console.warn('[proxyos] alert eval failed:', err)
    }
  }
  await tick()
  const t = setInterval(tick, intervalMs)
  return {
    stop: () => {
      stopped = true
      clearInterval(t)
    },
  }
}

export async function evaluateOnce(): Promise<EvalResult> {
  const db = getDb()
  const rules = await db.select().from(alertRules).where(eq(alertRules.enabled, true))
  let fired = 0
  const now = new Date()

  for (const row of rules) {
    const rule: AlertRule = {
      id: row.id,
      name: row.name,
      type: row.type as AlertType,
      targetRouteId: row.targetRouteId,
      config: JSON.parse(row.config) as AlertRuleConfig,
      enabled: row.enabled,
      lastFiredAt: row.lastFiredAt,
      createdAt: row.createdAt,
    }
    const cooldownMs = (rule.config.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES) * 60_000
    if (rule.lastFiredAt && now.getTime() - rule.lastFiredAt.getTime() < cooldownMs) continue

    const fire = await checkRule(rule)
    if (fire) {
      await db.insert(alertEvents).values({
        id: nanoid(),
        ruleId: rule.id,
        routeId: fire.routeId ?? null,
        message: fire.message,
        detail: fire.detail ? JSON.stringify(fire.detail) : null,
        firedAt: now,
      })
      await db.update(alertRules).set({ lastFiredAt: now }).where(eq(alertRules.id, rule.id))
      fired++
      console.log(`[proxyos] alert fired: ${rule.name} — ${fire.message}`)
      void sendAlertNotifications({ ruleName: rule.name, message: fire.message, detail: fire.detail }).catch((err) => {
        console.warn('[proxyos] alert notification failed:', err)
      })
    }
  }

  return { checked: rules.length, fired }
}

interface FireResult {
  routeId: string | null
  message: string
  detail?: Record<string, unknown>
}

async function checkRule(rule: AlertRule): Promise<FireResult | null> {
  switch (rule.type) {
    case 'cert_expiring':
      return checkCertExpiring(rule)
    case 'error_rate_spike':
      return checkErrorRate(rule)
    case 'latency_spike':
      return checkLatency(rule)
    case 'traffic_spike':
      return checkTrafficSpike(rule)
  }
}

async function checkCertExpiring(rule: AlertRule): Promise<FireResult | null> {
  const db = getDb()
  const days = rule.config.daysBeforeExpiry ?? 14
  const threshold = Date.now() + days * 24 * 60 * 60 * 1000
  const rows = await db.select().from(certificates)
  const expiring = rows.filter(
    (c) => c.expiresAt && c.expiresAt.getTime() <= threshold && c.expiresAt.getTime() > Date.now(),
  )
  if (expiring.length === 0) return null
  const c = expiring[0]!
  return {
    routeId: c.routeId,
    message: `Certificate for ${c.domain} expires in ${Math.round((c.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000))}d`,
    detail: { domain: c.domain, expiresAt: c.expiresAt },
  }
}

async function checkErrorRate(rule: AlertRule): Promise<FireResult | null> {
  if (!rule.targetRouteId) return null
  const windowMin = rule.config.windowMinutes ?? 5
  const threshold = rule.config.errorRatePct ?? 5
  const since = Date.now() - windowMin * 60_000
  const db = getDb()
  const rows = await db
    .select()
    .from(trafficMetrics)
    .where(and(eq(trafficMetrics.routeId, rule.targetRouteId), gte(trafficMetrics.bucketTs, since)))
  const agg = rows.reduce(
    (a, r) => ({ requests: a.requests + r.requests, errors: a.errors + r.errors + r.status5xx }),
    { requests: 0, errors: 0 },
  )
  if (agg.requests < (rule.config.thresholdRequests ?? 10)) return null
  const pct = (agg.errors / agg.requests) * 100
  if (pct < threshold) return null
  return {
    routeId: rule.targetRouteId,
    message: `Error rate ${pct.toFixed(1)}% over last ${windowMin}m (${agg.errors}/${agg.requests})`,
    detail: { pct, errors: agg.errors, requests: agg.requests },
  }
}

async function checkLatency(rule: AlertRule): Promise<FireResult | null> {
  if (!rule.targetRouteId) return null
  const windowMin = rule.config.windowMinutes ?? 5
  const threshold = rule.config.p95LatencyMs ?? 1000
  const since = Date.now() - windowMin * 60_000
  const db = getDb()
  const rows = await db
    .select()
    .from(trafficMetrics)
    .where(and(eq(trafficMetrics.routeId, rule.targetRouteId), gte(trafficMetrics.bucketTs, since)))
  const totalRequests = rows.reduce((a, r) => a + r.requests, 0)
  const totalLatency = rows.reduce((a, r) => a + r.latencySumMs, 0)
  if (totalRequests < (rule.config.thresholdRequests ?? 10)) return null
  const avg = totalLatency / totalRequests
  if (avg < threshold) return null
  return {
    routeId: rule.targetRouteId,
    message: `Avg latency ${Math.round(avg)}ms over last ${windowMin}m (threshold ${threshold}ms)`,
    detail: { avgLatencyMs: avg, windowMinutes: windowMin },
  }
}

async function checkTrafficSpike(rule: AlertRule): Promise<FireResult | null> {
  if (!rule.targetRouteId) return null
  const rpm = rule.config.requestsPerMinute ?? 500
  const since = Date.now() - 60_000
  const db = getDb()
  const rows = await db
    .select()
    .from(trafficMetrics)
    .where(and(eq(trafficMetrics.routeId, rule.targetRouteId), gte(trafficMetrics.bucketTs, since)))
  const total = rows.reduce((a, r) => a + r.requests, 0)
  if (total < rpm) return null
  return {
    routeId: rule.targetRouteId,
    message: `${total} req/min exceeds threshold ${rpm}`,
    detail: { requests: total, threshold: rpm },
  }
}
