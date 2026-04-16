export type ConnectEventMap = {
  'route.created':        { routeId: string; domain: string }
  'route.updated':        { routeId: string; domain: string }
  'route.deleted':        { routeId: string; domain: string }
  'cert.expiring':        { domain: string; expiresAt: Date; daysLeft: number }
  'upstream.down':        { routeId: string; upstream: string }
  'upstream.up':          { routeId: string; upstream: string }
  'anomaly.detected':     { routeId: string; metric: string; value: number; baseline: number }
  'monitor.down':         { routeId: string; monitorId: string; url: string }
  'monitor.up':           { routeId: string; monitorId: string; url: string }
  'dns.out_of_sync':      { routeId: string; domain: string; expected: string; actual: string }
  'tunnel.disconnected':  { routeId: string; tunnelId: string }
}

type Handler<T> = (payload: T) => void | Promise<void>

class EventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>()

  on<K extends keyof ConnectEventMap>(event: K, handler: Handler<ConnectEventMap[K]>): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    const set = this.handlers.get(event)!
    set.add(handler as Handler<unknown>)
    return () => { set.delete(handler as Handler<unknown>) }
  }

  emit<K extends keyof ConnectEventMap>(event: K, payload: ConnectEventMap[K]): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const handler of set) {
      void (handler as Handler<ConnectEventMap[K]>)(payload)
    }
  }
}

export const eventBus = new EventBus()
