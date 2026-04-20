import { getDb, users } from '@proxyos/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const db = getDb()
  const first = db.select({ id: users.id }).from(users).limit(1).get()
  return Response.json({ needsSetup: !first })
}
