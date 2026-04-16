export interface LockBoxOSConfig {
  baseUrl: string
  token: string
}

export interface LockBoxOSCredentialRef {
  vaultId: string
  secretPath: string
}

// Fetch a credential from LockBoxOS at use time — never cached beyond call
export async function fetchFromLockBox(cfg: LockBoxOSConfig, ref: LockBoxOSCredentialRef): Promise<string | null> {
  try {
    const res = await fetch(
      `${cfg.baseUrl}/api/v1/vaults/${encodeURIComponent(ref.vaultId)}/secrets/${encodeURIComponent(ref.secretPath)}`,
      {
        headers: { 'Authorization': `Bearer ${cfg.token}` },
        signal: AbortSignal.timeout(5_000),
      },
    )
    if (!res.ok) return null
    const data = await res.json() as { value?: string }
    return data.value ?? null
  } catch {
    return null
  }
}

export function parseLockBoxConfig(raw: string | null | undefined): LockBoxOSConfig | null {
  if (!raw) return null
  try { return JSON.parse(raw) as LockBoxOSConfig } catch { return null }
}
