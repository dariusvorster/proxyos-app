import { createServerCaller } from '~/lib/server-caller'
import DashboardClient from './_dashboard'

export default async function DashboardPage() {
  let initialRoutes, initialCerts, initialDrift, initialStale

  try {
    const caller = await createServerCaller()
    ;[initialRoutes, initialCerts, initialDrift, initialStale] = await Promise.all([
      caller.routes.list(),
      caller.certificates.list(),
      caller.drift.list(),
      caller.routes.listStale({ days: 30 }),
    ])
  } catch {
    // Unauthenticated or DB not ready — client will fetch on mount
  }

  return (
    <DashboardClient
      initialRoutes={initialRoutes}
      initialCerts={initialCerts}
      initialDrift={initialDrift}
      initialStale={initialStale}
    />
  )
}
