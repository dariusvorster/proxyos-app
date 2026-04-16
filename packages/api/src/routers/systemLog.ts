import { and, desc, eq, gte, like, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid, systemLog } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'

export type LogLevel = 'info' | 'warn' | 'error'
export type LogCategory = 'auth' | 'caddy' | 'system' | 'api' | 'user'

export function buildLogEntry(level: LogLevel, category: LogCategory, message: string, detail?: Record<string, unknown>, userId?: string) {
  return {
    id: nanoid(),
    level,
    category,
    message,
    detail: detail ? JSON.stringify(detail) : null,
    userId: userId ?? null,
    createdAt: new Date(),
  }
}

const LevelEnum = z.enum(['info', 'warn', 'error'])
const CategoryEnum = z.enum(['auth', 'caddy', 'system', 'api', 'user'])

export const systemLogRouter = router({
  list: publicProcedure
    .input(z.object({
      level: LevelEnum.optional(),
      category: CategoryEnum.optional(),
      search: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().min(1).max(1000).default(200),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input.level) conditions.push(eq(systemLog.level, input.level))
      if (input.category) conditions.push(eq(systemLog.category, input.category))
      if (input.search) conditions.push(like(systemLog.message, `%${input.search}%`))
      if (input.dateFrom) conditions.push(gte(systemLog.createdAt, new Date(input.dateFrom)))
      if (input.dateTo) conditions.push(lte(systemLog.createdAt, new Date(new Date(input.dateTo).getTime() + 86_400_000)))

      const rows = await ctx.db
        .select()
        .from(systemLog)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(systemLog.createdAt))
        .limit(input.limit)

      return rows.map(r => ({
        id: r.id,
        level: r.level as LogLevel,
        category: r.category as LogCategory,
        message: r.message,
        detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : null,
        userId: r.userId,
        createdAt: r.createdAt,
      }))
    }),

  add: publicProcedure
    .input(z.object({
      level: LevelEnum,
      category: CategoryEnum,
      message: z.string(),
      detail: z.record(z.unknown()).optional(),
      userId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(systemLog).values(buildLogEntry(input.level, input.category, input.message, input.detail, input.userId))
      return { ok: true }
    }),

  counts: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ level: systemLog.level, count: sql<number>`count(*)` })
      .from(systemLog)
      .groupBy(systemLog.level)
    const out = { info: 0, warn: 0, error: 0 }
    for (const r of rows) out[r.level as LogLevel] = Number(r.count)
    return out
  }),

  clear: publicProcedure
    .input(z.object({ olderThanDays: z.number().min(1).max(365).default(30) }))
    .mutation(async ({ ctx, input }) => {
      const cutoff = new Date(Date.now() - input.olderThanDays * 86_400_000)
      await ctx.db.delete(systemLog).where(lte(systemLog.createdAt, cutoff))
      return { ok: true }
    }),
})
