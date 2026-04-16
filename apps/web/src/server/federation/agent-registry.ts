import type WebSocket from 'ws'

export interface AgentState {
  id: string
  ws: WebSocket
  connectedAt: Date
  lastPingAt: Date
  caddyVersion?: string
  uptimeSeconds?: number
  upstreamHealth: Record<string, 'healthy' | 'degraded' | 'down'>
  certExpiry: Record<string, { expiryDays: number; issuer: string }>
}

class AgentRegistry {
  private agents = new Map<string, AgentState>()

  register(id: string, ws: WebSocket): void {
    this.agents.set(id, {
      id,
      ws,
      connectedAt: new Date(),
      lastPingAt: new Date(),
      upstreamHealth: {},
      certExpiry: {},
    })
  }

  deregister(id: string): void {
    this.agents.delete(id)
  }

  get(id: string): AgentState | undefined {
    return this.agents.get(id)
  }

  getAll(): AgentState[] {
    return Array.from(this.agents.values())
  }

  isOnline(id: string): boolean {
    return this.agents.has(id)
  }

  updatePing(id: string): void {
    const agent = this.agents.get(id)
    if (agent) agent.lastPingAt = new Date()
  }

  updateHealth(id: string, upstreams: Record<string, 'healthy' | 'degraded' | 'down'>): void {
    const agent = this.agents.get(id)
    if (agent) agent.upstreamHealth = upstreams
  }

  updateCerts(id: string, certs: Record<string, { expiryDays: number; issuer: string }>): void {
    const agent = this.agents.get(id)
    if (agent) agent.certExpiry = certs
  }

  updateSystem(id: string, caddyVersion: string, uptimeSeconds: number): void {
    const agent = this.agents.get(id)
    if (agent) { agent.caddyVersion = caddyVersion; agent.uptimeSeconds = uptimeSeconds }
  }
}

export const agentRegistry = new AgentRegistry()
