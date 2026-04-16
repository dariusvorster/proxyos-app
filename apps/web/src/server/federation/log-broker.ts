import type { MsgLogLine } from '@proxyos/federation'

type LogSubscriber = (line: MsgLogLine) => void

class LogBroker {
  private subs = new Map<string, Set<LogSubscriber>>()
  private recent = new Map<string, MsgLogLine[]>()
  private readonly MAX_RECENT = 500

  publish(msg: MsgLogLine): void {
    // Buffer recent lines per agent
    const buf = this.recent.get(msg.agentId) ?? []
    buf.push(msg)
    if (buf.length > this.MAX_RECENT) buf.shift()
    this.recent.set(msg.agentId, buf)

    // Fan out to per-agent subscribers
    this.subs.get(msg.agentId)?.forEach(sub => sub(msg))
    // Fan out to wildcard subscribers (all agents)
    this.subs.get('*')?.forEach(sub => sub(msg))
  }

  /**
   * Subscribe to log lines for a specific agentId (or '*' for all agents).
   * Returns an unsubscribe function.
   */
  subscribe(agentId: string, cb: LogSubscriber): () => void {
    if (!this.subs.has(agentId)) this.subs.set(agentId, new Set())
    this.subs.get(agentId)!.add(cb)
    return () => { this.subs.get(agentId)?.delete(cb) }
  }

  /** Return last up to MAX_RECENT lines buffered for an agent. */
  getRecent(agentId: string): MsgLogLine[] {
    return [...(this.recent.get(agentId) ?? [])]
  }
}

export const logBroker = new LogBroker()
