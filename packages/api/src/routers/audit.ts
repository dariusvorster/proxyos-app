import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { auditLog } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'

export const auditRouter = router({
  list: publicProcedure
    .input(
      z.object({
        resourceType: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const base = ctx.db.select().from(auditLog)
      const rows = input.resourceType
        ? await base.where(eq(auditLog.resourceType, input.resourceType)).orderBy(desc(auditLog.createdAt)).limit(input.limit)
        : await base.orderBy(desc(auditLog.createdAt)).limit(input.limit)
      return rows.map((r) => ({
        id: r.id,
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        resourceName: r.resourceName,
        actor: r.actor,
        detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : null,
        createdAt: r.createdAt,
      }))
    }),
})
