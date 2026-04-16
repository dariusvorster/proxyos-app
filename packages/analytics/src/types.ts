export interface CaddyLogEntry {
  ts: number
  level?: string
  msg?: string
  request?: {
    host?: string
    method?: string
    uri?: string
    remote_ip?: string
    headers?: Record<string, string[]>
  }
  status?: number
  size?: number
  duration?: number
}
