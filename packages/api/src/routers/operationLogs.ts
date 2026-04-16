import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid, operationLogs } from '@proxyos/db'
import type { Db } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = 'info' | 'success' | 'error' | 'warning'

interface OperationStep {
  ts: number
  message: string
  status: StepStatus
}

// ─── Helper functions ─────────────────────────────────────────────────────────

export async function startOperation(
  db: Db,
  type: string,
  subject: string,
): Promise<string> {
  const id = nanoid()
  const now = new Date()
  await db.insert(operationLogs).values({
    id,
    type,
    subject,
    status: 'in_progress',
    steps: '[]',
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function addStep(
  db: Db,
  operationId: string,
  step: { message: string; status: StepStatus },
): Promise<void> {
  const rows = await db
    .select({ steps: operationLogs.steps })
    .from(operationLogs)
    .where(eq(operationLogs.id, operationId))
    .limit(1)

  if (!rows.length) return

  const existing: OperationStep[] = JSON.parse(rows[0]?.steps ?? '[]')
  const newStep: OperationStep = { ts: Date.now(), message: step.message, status: step.status }
  existing.push(newStep)

  await db
    .update(operationLogs)
    .set({ steps: JSON.stringify(existing), updatedAt: new Date() })
    .where(eq(operationLogs.id, operationId))
}

export async function completeOperation(
  db: Db,
  operationId: string,
  status: 'success' | 'error',
  error?: string,
  startedAt?: number,
): Promise<void> {
  const durationMs = startedAt != null ? Date.now() - startedAt : undefined
  await db
    .update(operationLogs)
    .set({
      status,
      error: error ?? null,
      durationMs: durationMs ?? null,
      updatedAt: new Date(),
    })
    .where(eq(operationLogs.id, operationId))
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const operationLogsRouter = router({
  list: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).default(200),
      type: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input.type) conditions.push(eq(operationLogs.type, input.type))
      if (input.status) conditions.push(eq(operationLogs.status, input.status))

      const rows = await ctx.db
        .select()
        .from(operationLogs)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(operationLogs.createdAt))
        .limit(input.limit)

      return rows.map(r => ({
        id: r.id,
        type: r.type,
        subject: r.subject,
        status: r.status,
        durationMs: r.durationMs,
        error: r.error,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
    }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(operationLogs)
        .where(eq(operationLogs.id, input.id))
        .limit(1)

      if (!rows.length) return null
      const r = rows[0]

      return {
        id: r.id,
        type: r.type,
        subject: r.subject,
        status: r.status,
        steps: JSON.parse(r.steps ?? '[]') as OperationStep[],
        durationMs: r.durationMs,
        error: r.error,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }
    }),
})
