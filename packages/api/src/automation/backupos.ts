import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface BackupOSTarget {
  id: string
  name: string
  type: 'sqlite' | 'json'
  path: string
  description: string
}

export interface BackupOSRegistration {
  appName: string
  version: string
  targets: BackupOSTarget[]
  webhookUrl: string | null
}

export function buildBackupOSRegistration(dbPath: string, caddyConfigPath?: string): BackupOSRegistration {
  const targets: BackupOSTarget[] = [
    {
      id: 'proxyos-db',
      name: 'ProxyOS SQLite database',
      type: 'sqlite',
      path: resolve(dbPath),
      description: 'Main ProxyOS database — routes, connections, certificates, analytics',
    },
  ]

  if (caddyConfigPath && existsSync(caddyConfigPath)) {
    targets.push({
      id: 'caddy-config',
      name: 'Caddy configuration',
      type: 'json',
      path: resolve(caddyConfigPath),
      description: 'Caddy runtime config state',
    })
  }

  return {
    appName: 'ProxyOS',
    version: process.env.PROXYOS_VERSION ?? '3.0.0',
    targets,
    webhookUrl: process.env.BACKUPOS_WEBHOOK_URL ?? null,
  }
}

export async function notifyBackupOS(webhookUrl: string, event: 'pre_migration' | 'post_migration' | 'pre_update' | 'health_ok' | 'health_fail'): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: 'ProxyOS', event, timestamp: new Date().toISOString() }),
      signal: AbortSignal.timeout(5_000),
    })
  } catch { /* non-fatal */ }
}
