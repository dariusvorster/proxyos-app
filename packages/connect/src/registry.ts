import type { ConnectionAdapter, ConnectionType } from './types'

class AdapterRegistry {
  private adapters = new Map<string, ConnectionAdapter>()

  register(adapter: ConnectionAdapter): void {
    this.adapters.set(adapter.connectionId, adapter)
  }

  deregister(connectionId: string): void {
    this.adapters.delete(connectionId)
  }

  get(connectionId: string): ConnectionAdapter | undefined {
    return this.adapters.get(connectionId)
  }

  getByType(type: ConnectionType): ConnectionAdapter[] {
    return [...this.adapters.values()].filter(a => a.type === type)
  }

  all(): ConnectionAdapter[] {
    return [...this.adapters.values()]
  }
}

export const adapterRegistry = new AdapterRegistry()
