import type { CaddyRoute } from './types'

export function applyDockerDns(route: CaddyRoute): CaddyRoute {
  return {
    ...route,
    handle: route.handle.map((h) => {
      if ((h as Record<string, unknown>).handler !== 'reverse_proxy') return h
      const rp = h as Record<string, unknown>
      const existing = (rp.transport as Record<string, unknown> | undefined) ?? {}
      return {
        ...rp,
        transport: {
          protocol: 'http',
          ...existing,
          resolvers: ['127.0.0.11'],
          dial_timeout: '3s',
        },
      }
    }),
  }
}
