import type { TlsMode } from '@proxyos/types'

export type ImportSourceType = 'nginx' | 'npm' | 'traefik' | 'caddy' | 'apache' | 'haproxy'

export interface ImportedRoute {
  // Core
  domain: string
  upstream: string               // host:port
  protocol: 'http' | 'https'

  // TLS
  tlsDetected: boolean
  suggestedTlsMode: TlsMode

  // Access
  ssoDetected: boolean
  ssoProvider?: string           // "authentik" | "authelia" | "unknown"
  ssoUrl?: string
  basicAuthDetected: boolean
  ipAllowlist?: string[]

  // Options
  compressionDetected: boolean
  websocketDetected: boolean
  rateLimitDetected: boolean
  rateLimitRpm?: number

  // Import metadata
  sourceType: ImportSourceType
  sourceIdentifier: string
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
  canAutoImport: boolean
}

export interface ImportPreviewResult {
  sessionId: string
  sourceType: ImportSourceType
  routes: ImportedRoute[]
  parseErrors: string[]
}

export interface ImportCommitResult {
  sessionId: string
  created: string[]   // route IDs
  skipped: string[]   // domains skipped
  failed: Array<{ domain: string; error: string }>
}
