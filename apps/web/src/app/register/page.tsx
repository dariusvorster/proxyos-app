import { redirect } from 'next/navigation'
import { getDb, users } from '@proxyos/db'
import RegisterForm from './register-form'

export const dynamic = 'force-dynamic'

export default async function RegisterPage() {
  const db = getDb()
  const existing = await db.select({ id: users.id }).from(users).limit(1).all()
  if (existing.length > 0) {
    redirect('/login')
  }

  return <RegisterForm />
}
