import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { getDb, federationNodes, nodeEnrollmentTokens, nodeAuthKeys } from '@proxyos/db'
import { eq, and, gt, isNull } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    token: string
    agent_name: string
    hostname: string
    os: string
    proxyos_version: string
  }

  if (!body.token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  const db = getDb()
  const now = new Date()

  const candidates = await db
    .select()
    .from(nodeEnrollmentTokens)
    .where(and(isNull(nodeEnrollmentTokens.usedAt), gt(nodeEnrollmentTokens.expiresAt, now)))

  let matched: typeof candidates[number] | null = null
  for (const t of candidates) {
    if (await bcrypt.compare(body.token, t.tokenHash)) {
      matched = t
      break
    }
  }

  if (!matched) {
    return NextResponse.json({ error: 'invalid or expired token' }, { status: 401 })
  }

  const agentId = `node_${randomUUID().replace(/-/g, '').slice(0, 16)}`
  const authKey = randomBytes(32).toString('base64url')
  const authKeyHash = await bcrypt.hash(authKey, 12)
  const tenantId = matched.tenantId
  const siteId = matched.siteId
  const matchedId = matched.id

  await db
    .update(nodeEnrollmentTokens)
    .set({ usedAt: now })
    .where(eq(nodeEnrollmentTokens.id, matchedId))

  await db.insert(federationNodes).values({
    id: agentId,
    tenantId,
    siteId,
    name: body.agent_name,
    hostname: body.hostname,
    osInfo: body.os,
    agentVersion: body.proxyos_version,
    status: 'pending',
    enrolledAt: now,
    createdAt: now,
  })

  await db.insert(nodeAuthKeys).values({
    id: randomUUID(),
    tenantId,
    nodeId: agentId,
    keyHash: authKeyHash,
    createdAt: now,
  })

  const rawPublicUrl = process.env.PROXYOS_PUBLIC_URL ?? 'ws://localhost:7890'
  const centralUrl = rawPublicUrl.replace(/^https?/, (m) => m === 'https' ? 'wss' : 'ws') + '/federation/v1'

  return NextResponse.json({ agent_id: agentId, auth_key: authKey, central_url: centralUrl })
}
