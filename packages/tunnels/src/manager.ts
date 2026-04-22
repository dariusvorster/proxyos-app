import type { TunnelProvider, TunnelProviderType, TunnelRouteSpec, TunnelRouteResult, TunnelHealth } from './types'
import { processManager } from './process-manager'

class TunnelManager {
  private providers = new Map<string, TunnelProvider>()

  register(provider: TunnelProvider): void {
    this.providers.set(provider.providerId, provider)
  }

  deregister(providerId: string): void {
    this.providers.delete(providerId)
  }

  get(providerId: string): TunnelProvider | undefined {
    return this.providers.get(providerId)
  }

  getByType(type: TunnelProviderType): TunnelProvider[] {
    return [...this.providers.values()].filter(p => p.type === type)
  }

  all(): TunnelProvider[] {
    return [...this.providers.values()]
  }

  async startProvider(provider: TunnelProvider): Promise<void> {
    this.register(provider)
    await provider.start(processManager)
  }

  async stopProvider(providerId: string): Promise<void> {
    const provider = this.providers.get(providerId)
    if (!provider) return
    await provider.stop()
    await processManager.stop(this.sidecarId(provider))
    this.deregister(providerId)
  }

  async restartProvider(providerId: string): Promise<void> {
    const provider = this.providers.get(providerId)
    if (!provider) return
    await processManager.stop(this.sidecarId(provider))
    await provider.start(processManager)
  }

  async addRouteToTunnel(routeId: string, providerId: string, spec: TunnelRouteSpec): Promise<TunnelRouteResult> {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error(`No tunnel provider loaded for id=${providerId}`)
    return provider.addRoute(spec)
  }

  async removeRouteFromTunnel(routeId: string, providerId: string): Promise<void> {
    const provider = this.providers.get(providerId)
    if (!provider) return
    // The tRPC layer passes routeRef; here we use routeId as a best-effort
    await provider.removeRoute(routeId)
  }

  async getHealth(providerId: string): Promise<TunnelHealth> {
    const provider = this.providers.get(providerId)
    if (!provider) {
      return { status: 'stopped', details: { sidecarRunning: false, lastError: 'Provider not loaded' } }
    }
    return provider.health()
  }

  getLogs(providerId: string, lines = 200): string[] {
    const proc = processManager.get(this.sidecarIdByProviderId(providerId))
    return proc ? proc.logs(lines) : []
  }

  private sidecarId(provider: TunnelProvider): string {
    const prefixMap: Record<TunnelProviderType, string> = {
      cloudflare: 'cf',
      tailscale: 'ts-daemon',
      ngrok: 'ngrok',
    }
    return `${prefixMap[provider.type]}-${provider.providerId}`
  }

  private sidecarIdByProviderId(providerId: string): string {
    const provider = this.providers.get(providerId)
    return provider ? this.sidecarId(provider) : providerId
  }
}

export const tunnelManager = new TunnelManager()
