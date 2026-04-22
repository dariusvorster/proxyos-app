import type { Result } from '@proxyos/types'

export interface LockBoxOSConfig {
  baseUrl: string
  token: string
}

export interface LockBoxOSCredentialRef {
  vaultId: string
  secretPath: string
}

// Fetch a credential from LockBoxOS at use time — never cached beyond call
export async function fetchFromLockBox(cfg: LockBoxOSConfig, ref: LockBoxOSCredentialRef): Promise<Result<string, Error>> {
  try {
    const res = await fetch(
      `${cfg.baseUrl}/api/v1/vaults/${encodeURIComponent(ref.vaultId)}/secrets/${encodeURIComponent(ref.secretPath)}`,
      {
        headers: { 'Authorization': `Bearer ${cfg.token}` },
        signal: AbortSignal.timeout(5_000),
      },
    )
    if (!res.ok) return { ok: false, error: new Error(`LockBoxOS returned HTTP ${res.status} for secret '${ref.secretPath}'`) }
    const data = await res.json() as { value?: string }
    if (data.value == null) return { ok: false, error: new Error(`LockBoxOS returned no value for secret '${ref.secretPath}'`) }
    return { ok: true, value: data.value }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) }
  }
}

export function parseLockBoxConfig(raw: string | null | undefined): LockBoxOSConfig | null {
  if (!raw) return null
  try { return JSON.parse(raw) as LockBoxOSConfig } catch { return null }
}
