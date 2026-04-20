import { getDb, users, nanoid } from '@proxyos/db'
import { hash } from 'bcryptjs'
import { signToken, makeTokenCookie } from '@proxyos/api/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const db = getDb()
  const existing = db.select({ id: users.id }).from(users).limit(1).get()
  if (existing) {
    return Response.json({ error: 'Setup already complete' }, { status: 403 })
  }

  const body = await req.json() as { email?: string; password?: string }
  const { email, password } = body
  if (!email || !password || password.length < 8) {
    return Response.json({ error: 'Email and password (8+ chars) required' }, { status: 400 })
  }

  const passwordHash = await hash(password, 12)
  const id = nanoid()
  db.insert(users).values({ id, email, passwordHash, role: 'admin', createdAt: new Date() }).run()

  const token = signToken({ userId: id, role: 'admin' })
  const cookie = makeTokenCookie(token, req)

  return new Response(JSON.stringify({ id, email, role: 'admin' }), {
    status: 201,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
  })
}
