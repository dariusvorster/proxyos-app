import net from 'net'
import { resolve4 } from 'dns/promises'
import { z } from 'zod'
import { publicProcedure, router } from '../trpc'

// ─── TCP connect helper ───────────────────────────────────────────────────────

function tcpConnect(host: string, port: number, timeoutMs = 3000): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const socket = net.createConnection({ host, port })

    const timer = setTimeout(() => {
      socket.destroy()
      resolve({ reachable: false, latencyMs: Date.now() - start, error: 'Connection timed out' })
    }, timeoutMs)

    socket.on('connect', () => {
      clearTimeout(timer)
      const latencyMs = Date.now() - start
      socket.destroy()
      resolve({ reachable: true, latencyMs })
    })

    socket.on('error', (err) => {
      clearTimeout(timer)
      resolve({ reachable: false, latencyMs: Date.now() - start, error: err.message })
    })
  })
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const preflightRouter = router({
  checkUpstream: publicProcedure
    .input(z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535),
    }))
    .mutation(async ({ input }) => {
      return tcpConnect(input.host, input.port)
    }),

  checkDns: publicProcedure
    .input(z.object({
      domain: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      try {
        const addresses = await resolve4(input.domain)
        return {
          resolves: true,
          resolvedIp: addresses[0],
        }
      } catch (err) {
        return {
          resolves: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }),
})
