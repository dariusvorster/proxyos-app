import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/setup' ||
    pathname === '/login' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  try {
    const res = await fetch(new URL('/api/auth/setup-status', req.url), { cache: 'no-store' })
    if (res.ok) {
      const { needsSetup } = await res.json() as { needsSetup: boolean }
      if (needsSetup) {
        return NextResponse.redirect(new URL('/setup', req.url))
      }
    }
  } catch {
    // Don't block the request if the check fails
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
