import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { NodeConfig } from './config-builder'

export function saveConfigCache(cachePath: string, config: NodeConfig): void {
  try {
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, JSON.stringify(config), { mode: 0o600 })
  } catch (e) {
    console.warn('[federation] failed to write config cache:', e)
  }
}

export function loadConfigCache(cachePath: string): NodeConfig | null {
  if (!existsSync(cachePath)) return null
  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as NodeConfig
  } catch {
    return null
  }
}
