export type FederationMessage =
  | HelloMessage
  | WelcomeMessage
  | ConfigApplyMessage
  | ConfigAckMessage
  | ConfigLocalUpdateMessage
  | PingMessage
  | PongMessage
  | RevokeMessage
  | RescanMessage
  | TelemetryHeartbeatMessage
  | TelemetryContainersMessage
  | TelemetryEventMessage
  | ErrorMessage

export interface BaseMessage {
  type: string
  request_id: string
  payload: Record<string, unknown>
}

export interface HelloMessage extends BaseMessage {
  type: 'hello'
  payload: {
    agent_id: string
    agent_version: string
    token_hash: string
    hostname: string
    os: string
    docker_version: string
    capabilities: string[]
    config_version_applied: number
  }
}

export interface WelcomeMessage extends BaseMessage {
  type: 'welcome'
  payload: {
    agent_id: string
    site_id: string
    config_version: number
    server_time: number
  }
}

export interface ConfigApplyMessage extends BaseMessage {
  type: 'config.apply' | 'config.reconcile'
  payload: {
    version: number
    routes: RouteConfig[]
    settings: Record<string, unknown>
  }
}

export interface RouteConfig {
  id: string
  host: string
  upstream: string
  tls_mode: string
  websocket_enabled: boolean
  origin: 'central' | 'local'
  scope: 'exclusive' | 'local_only'
}

export interface ConfigAckMessage extends BaseMessage {
  type: 'config.ack'
  payload: {
    version: number
    applied_at: number
    success: boolean
    error?: string
  }
}

export interface ConfigLocalUpdateMessage extends BaseMessage {
  type: 'config.local_update'
  payload: {
    action: 'upsert' | 'delete'
    route: RouteConfig
  }
}

export interface PingMessage extends BaseMessage {
  type: 'cmd.ping'
  payload: { ts: number }
}

export interface PongMessage extends BaseMessage {
  type: 'pong'
  payload: { ts: number }
}

export interface RevokeMessage extends BaseMessage {
  type: 'cmd.revoke'
  payload: { reason: string }
}

export interface RescanMessage extends BaseMessage {
  type: 'cmd.rescan'
  payload: Record<string, never>
}

export interface TelemetryHeartbeatMessage extends BaseMessage {
  type: 'telemetry.heartbeat'
  payload: {
    routes_active: number
    requests_since_last: number
    errors_since_last: number
    caddy_ok: boolean
    docker_ok: boolean
    mem_mb: number
    cpu_pct: number
  }
}

export interface TelemetryContainersMessage extends BaseMessage {
  type: 'telemetry.containers'
  payload: {
    containers: Array<{
      id: string
      name: string
      image: string
      networks: string[]
      ports: Array<{ port: number; protocol: string }>
    }>
    networks: Array<{ id: string; name: string; container_count: number }>
  }
}

export interface TelemetryEventMessage extends BaseMessage {
  type: 'telemetry.event'
  payload: {
    event_type: string
    details: Record<string, unknown>
  }
}

export interface ErrorMessage extends BaseMessage {
  type: 'error'
  payload: {
    code: string
    message: string
    caused_by?: string
  }
}
