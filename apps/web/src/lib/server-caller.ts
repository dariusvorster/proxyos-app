import { appRouter, createContext } from '@proxyos/api'
import { headers } from 'next/headers'

export async function createServerCaller() {
  const hdrs = await headers()
  const req = new Request('http://internal/api/trpc', {
    headers: { cookie: hdrs.get('cookie') ?? '' },
  })
  const ctx = await createContext({ req })
  return appRouter.createCaller(ctx)
}
