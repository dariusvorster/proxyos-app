import type { SSOProviderType } from '@proxyos/types'

export interface SSOProviderDriver {
  type: SSOProviderType
  buildForwardAuthUrl(baseUrl: string): string
  defaultResponseHeaders(): string[]
}

const authentik: SSOProviderDriver = {
  type: 'authentik',
  buildForwardAuthUrl: (base) => `${trimSlash(base)}/outpost.goauthentik.io/auth/caddy`,
  defaultResponseHeaders: () => [
    'X-authentik-username',
    'X-authentik-groups',
    'X-authentik-email',
    'X-authentik-name',
    'X-authentik-uid',
  ],
}

const authelia: SSOProviderDriver = {
  type: 'authelia',
  buildForwardAuthUrl: (base) => `${trimSlash(base)}/api/verify?rd=${encodeURIComponent(trimSlash(base))}`,
  defaultResponseHeaders: () => [
    'Remote-User',
    'Remote-Groups',
    'Remote-Name',
    'Remote-Email',
  ],
}

const keycloak: SSOProviderDriver = {
  type: 'keycloak',
  buildForwardAuthUrl: (base) => `${trimSlash(base)}/auth`,
  defaultResponseHeaders: () => ['X-Auth-Request-User', 'X-Auth-Request-Email', 'X-Auth-Request-Groups'],
}

const zitadel: SSOProviderDriver = {
  type: 'zitadel',
  buildForwardAuthUrl: (base) => `${trimSlash(base)}/oauth/v2/introspect`,
  defaultResponseHeaders: () => ['X-Zitadel-User', 'X-Zitadel-Email'],
}

const drivers: Record<SSOProviderType, SSOProviderDriver> = {
  authentik,
  authelia,
  keycloak,
  zitadel,
}

export function getDriver(type: SSOProviderType): SSOProviderDriver {
  return drivers[type]
}

export async function testForwardAuth(url: string, timeoutMs = 3000): Promise<{ ok: boolean; latencyMs: number; status?: number; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const start = performance.now()
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'manual' })
    return {
      ok: res.status < 500,
      latencyMs: Math.round(performance.now() - start),
      status: res.status,
    }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: (err as Error).message,
    }
  } finally {
    clearTimeout(timer)
  }
}

function trimSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s
}
