import type { ImportedRoute } from '../types'
import type { TraefikRouter, TraefikService } from './api-reader'
import { traefikRouterToProxyOSRoute } from './api-reader'

export interface ContainerLabels {
  id: string
  name: string
  image: string
  labels: Record<string, string>
  networks: Array<{ ip: string; name: string }>
  ports: Array<{ hostPort: number; containerPort: number; ip: string }>
}

function extractDomainFromRule(rule: string): string | null {
  const m = rule.match(/Host\(`([^`]+)`\)/)
  return m ? (m[1] ?? null) : null
}

export function scanDockerForTraefikLabels(containers: ContainerLabels[]): ImportedRoute[] {
  const routes: ImportedRoute[] = []

  // Build service map from labels across all containers
  const servicePortMap: Record<string, number> = {}
  const serviceHostMap: Record<string, string> = {}

  for (const c of containers) {
    for (const [key, val] of Object.entries(c.labels)) {
      const svcPortMatch = key.match(/^traefik\.http\.services\.([\w-]+)\.loadbalancer\.server\.port$/)
      if (svcPortMatch) servicePortMap[svcPortMatch[1] ?? ''] = parseInt(val)

      // Service URL is container IP:port
      const svcName = key.match(/^traefik\.http\.routers\.([\w-]+)\.service$/)?.[1]
      if (svcName) {
        const ip = c.networks[0]?.ip ?? '127.0.0.1'
        serviceHostMap[svcName] = ip
      }
    }
  }

  for (const c of containers) {
    if (!c.labels['traefik.enable'] || c.labels['traefik.enable'] === 'false') continue

    // Find all router labels on this container
    const routerNames = new Set<string>()
    for (const key of Object.keys(c.labels)) {
      const m = key.match(/^traefik\.http\.routers\.([\w-]+)\.rule$/)
      if (m) routerNames.add(m[1] ?? '')
    }

    for (const routerName of routerNames) {
      const rule = c.labels[`traefik.http.routers.${routerName}.rule`]
      if (!rule) continue
      const domain = extractDomainFromRule(rule)
      if (!domain) continue

      const serviceName = c.labels[`traefik.http.routers.${routerName}.service`] ?? routerName
      const port = servicePortMap[serviceName] ?? c.ports[0]?.containerPort ?? 80
      const ip = serviceHostMap[serviceName] ?? c.networks[0]?.ip ?? '127.0.0.1'
      const upstream = `${ip}:${port}`

      const hasTLS = !!c.labels[`traefik.http.routers.${routerName}.tls`]
        || !!c.labels[`traefik.http.routers.${routerName}.tls.certresolver`]

      const traefikRouter: TraefikRouter = {
        name: routerName,
        rule,
        service: serviceName,
        tls: hasTLS ? {} : undefined,
      }
      const traefikService: TraefikService = {
        name: serviceName,
        loadBalancer: { servers: [{ url: `http://${upstream}` }] },
      }

      const route = traefikRouterToProxyOSRoute(traefikRouter, [traefikService])
      if (route) {
        routes.push({
          ...route,
          upstream,
          sourceType: 'traefik',
          sourceIdentifier: `container:${c.name}:router:${routerName}`,
        })
      }
    }
  }

  return routes
}
