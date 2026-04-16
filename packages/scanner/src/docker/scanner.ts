import type { ImportedRoute } from '@proxyos/importers'
import { parseProxyOSLabels, proxyOSLabelsToRoute } from './label-parser'
import { scanDockerForTraefikLabels, type ContainerLabels } from '@proxyos/importers'
import { resolveUpstream, isLikelyHTTP, type ScannerContainer } from './upstream-resolver'

export interface DockerScannerConfig {
  socketPath?: string
  apiUrl?: string
  agentId?: string
  baseDomainsHint?: string[]
}

export interface DetectedRoute {
  container: ScannerContainer
  suggestedDomain: string
  suggestedUpstream: string
  strategy: 'proxyos_labels' | 'traefik_labels' | 'heuristic'
  confidence: 'high' | 'medium' | 'low'
  tlsMode: 'auto' | 'dns' | 'internal' | 'off'
  ssoEnabled: boolean
  warnings: string[]
  alreadyConfigured: boolean
  route?: ImportedRoute
}

export interface ScannedContainer {
  id: string
  name: string
  image: string
  status: string
  detectedRoutes: DetectedRoute[]
  skipped: boolean
  skipReason?: string
}

const KNOWN_IMAGES: Record<string, { suggestedPort: number; suggestedSubdomain: string }> = {
  'gitea/gitea':           { suggestedPort: 3000,  suggestedSubdomain: 'git' },
  'ghcr.io/immich-app':   { suggestedPort: 2283,  suggestedSubdomain: 'photos' },
  'portainer/portainer':  { suggestedPort: 9000,  suggestedSubdomain: 'portainer' },
  'sonarqube':            { suggestedPort: 9000,  suggestedSubdomain: 'sonar' },
  'n8nio/n8n':            { suggestedPort: 5678,  suggestedSubdomain: 'n8n' },
  'vaultwarden/server':   { suggestedPort: 80,    suggestedSubdomain: 'vault' },
  'zammad/zammad':        { suggestedPort: 3000,  suggestedSubdomain: 'support' },
  'grafana/grafana':      { suggestedPort: 3000,  suggestedSubdomain: 'grafana' },
  'louislam/uptime-kuma': { suggestedPort: 3001,  suggestedSubdomain: 'status' },
  'homarr':               { suggestedPort: 7575,  suggestedSubdomain: 'home' },
  'linuxserver/jellyfin': { suggestedPort: 8096,  suggestedSubdomain: 'media' },
  'nextcloud':            { suggestedPort: 80,    suggestedSubdomain: 'cloud' },
  'wikijs/wiki':          { suggestedPort: 3000,  suggestedSubdomain: 'wiki' },
}

function findKnownImage(image: string): { suggestedPort: number; suggestedSubdomain: string } | undefined {
  for (const [key, val] of Object.entries(KNOWN_IMAGES)) {
    if (image.includes(key)) return val
  }
  return undefined
}

export class DockerScanner {
  private config: DockerScannerConfig
  private existingDomains: Set<string>

  constructor(config: DockerScannerConfig, existingDomains: string[] = []) {
    this.config = config
    this.existingDomains = new Set(existingDomains)
  }

  async scanRaw(): Promise<ScannedContainer[]> {
    const apiBase = this.config.apiUrl ?? 'http://localhost:2375'
    const res = await fetch(`${apiBase}/containers/json`)
    if (!res.ok) throw new Error(`Docker API error: ${res.status} ${res.statusText}`)
    const containers = await res.json() as Array<{
      Id: string
      Names: string[]
      Image: string
      State: string
      Labels: Record<string, string>
      Ports: Array<{ IP?: string; PrivatePort: number; PublicPort?: number; Type: string }>
      NetworkSettings: { Networks: Record<string, { IPAddress: string }> }
    }>

    return containers.map(c => this.processContainer(c))
  }

  private processContainer(raw: {
    Id: string
    Names: string[]
    Image: string
    State: string
    Labels: Record<string, string>
    Ports: Array<{ IP?: string; PrivatePort: number; PublicPort?: number; Type: string }>
    NetworkSettings: { Networks: Record<string, { IPAddress: string }> }
  }): ScannedContainer {
    const name = (raw.Names[0] ?? '').replace(/^\//, '')
    const networks = Object.entries(raw.NetworkSettings.Networks).map(([netName, net]) => ({
      ip: net.IPAddress,
      name: netName,
    }))
    const ports = raw.Ports.filter(p => p.Type === 'tcp').map(p => ({
      hostPort: p.PublicPort ?? 0,
      containerPort: p.PrivatePort,
      ip: p.IP ?? '0.0.0.0',
    }))

    const container: ScannerContainer = {
      id: raw.Id,
      name,
      image: raw.Image,
      status: raw.State,
      networks,
      ports,
      labels: raw.Labels,
    }

    const detectedRoutes = this.detectRoutes(container)
    return {
      id: raw.Id,
      name,
      image: raw.Image,
      status: raw.State,
      detectedRoutes,
      skipped: detectedRoutes.length === 0,
      skipReason: detectedRoutes.length === 0 ? 'No HTTP ports or proxy labels detected' : undefined,
    }
  }

  private detectRoutes(container: ScannerContainer): DetectedRoute[] {
    const results: DetectedRoute[] = []
    const baseDomain = this.config.baseDomainsHint?.[0] ?? 'local'

    // Strategy A: ProxyOS native labels
    const proxyosLabels = parseProxyOSLabels(container.labels)
    if (proxyosLabels) {
      const ip = container.networks[0]?.ip ?? '127.0.0.1'
      const upstream = resolveUpstream(container, proxyosLabels.port ?? 80)
      const route = proxyOSLabelsToRoute(proxyosLabels, container.name, ip)
      const alreadyConfigured = this.existingDomains.has(route.domain)
      results.push({
        container,
        suggestedDomain: route.domain,
        suggestedUpstream: upstream,
        strategy: 'proxyos_labels',
        confidence: proxyosLabels.domain ? 'high' : 'medium',
        tlsMode: proxyosLabels.tls ?? 'auto',
        ssoEnabled: !!proxyosLabels.sso && proxyosLabels.sso !== 'none',
        warnings: route.warnings,
        alreadyConfigured,
        route,
      })
      return results
    }

    // Strategy B: Traefik label compatibility
    const containerLabels: ContainerLabels = {
      id: container.id,
      name: container.name,
      image: container.image,
      labels: container.labels,
      networks: container.networks,
      ports: container.ports,
    }
    const traefikRoutes = scanDockerForTraefikLabels([containerLabels])
    for (const route of traefikRoutes) {
      const alreadyConfigured = this.existingDomains.has(route.domain)
      results.push({
        container,
        suggestedDomain: route.domain,
        suggestedUpstream: route.upstream,
        strategy: 'traefik_labels',
        confidence: 'high',
        tlsMode: (['auto', 'dns', 'internal', 'off'] as const).includes(route.suggestedTlsMode as 'auto')
          ? route.suggestedTlsMode as 'auto' | 'dns' | 'internal' | 'off'
          : 'auto',
        ssoEnabled: route.ssoDetected,
        warnings: route.warnings,
        alreadyConfigured,
        route,
      })
    }
    if (results.length > 0) return results

    // Strategy C: Heuristic
    const httpPorts = container.ports.filter(p => isLikelyHTTP(p.containerPort))
    const known = findKnownImage(container.image)

    if (known) {
      const upstream = resolveUpstream(container, known.suggestedPort)
      const domain = `${known.suggestedSubdomain}.${baseDomain}`
      const alreadyConfigured = this.existingDomains.has(domain)
      results.push({
        container,
        suggestedDomain: domain,
        suggestedUpstream: upstream,
        strategy: 'heuristic',
        confidence: 'medium',
        tlsMode: 'auto',
        ssoEnabled: false,
        warnings: ['No explicit labels — domain suggestion based on image name. Review before exposing.'],
        alreadyConfigured,
      })
    } else if (httpPorts.length > 0) {
      const port = httpPorts[0]!
      const upstream = resolveUpstream(container, port.containerPort)
      const domain = `${container.name}.${baseDomain}`
      const alreadyConfigured = this.existingDomains.has(domain)
      results.push({
        container,
        suggestedDomain: domain,
        suggestedUpstream: upstream,
        strategy: 'heuristic',
        confidence: 'low',
        tlsMode: 'auto',
        ssoEnabled: false,
        warnings: ['Heuristic detection only — review domain and upstream before exposing.'],
        alreadyConfigured,
      })
    }

    return results
  }
}
