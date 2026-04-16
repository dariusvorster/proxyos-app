import type { ImportedRoute } from '@proxyos/importers'
import { parseProxyOSLabels, proxyOSLabelsToRoute } from './label-parser'
import { scanDockerForTraefikLabels, type ContainerLabels } from '@proxyos/importers'
import { isLikelyHTTP } from './upstream-resolver'

interface ComposeService {
  image?: string
  build?: string | { context: string }
  ports?: string[]
  labels?: Record<string, string> | string[]
  networks?: string[] | Record<string, unknown>
}

interface ComposeFile {
  services?: Record<string, ComposeService>
}

function parsePortMapping(portStr: string): { hostPort: number; containerPort: number } | null {
  // formats: "8080:80", "80", "127.0.0.1:8080:80"
  const parts = portStr.split(':')
  if (parts.length === 1) {
    const p = parseInt(parts[0] ?? '')
    return isNaN(p) ? null : { hostPort: 0, containerPort: p }
  }
  const containerPort = parseInt(parts[parts.length - 1] ?? '')
  const hostPort = parseInt(parts[parts.length - 2] ?? '0')
  if (isNaN(containerPort)) return null
  return { hostPort: isNaN(hostPort) ? 0 : hostPort, containerPort }
}

function normalizeLabels(raw: Record<string, string> | string[]): Record<string, string> {
  if (Array.isArray(raw)) {
    const result: Record<string, string> = {}
    for (const entry of raw) {
      const eqIdx = entry.indexOf('=')
      if (eqIdx > 0) result[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1)
      else result[entry] = 'true'
    }
    return result
  }
  return raw
}

/**
 * Parse a docker-compose.yml (as YAML string) and extract route suggestions.
 * Uses a minimal YAML parser — only handles the services section patterns we need.
 */
export function parseComposeFile(content: string): ImportedRoute[] {
  // Use JSON-safe YAML subset: parse key: value lines with indentation
  const compose = parseMinimalYAML(content) as ComposeFile
  if (!compose.services) return []

  const routes: ImportedRoute[] = []

  for (const [serviceName, svc] of Object.entries(compose.services)) {
    if (!svc) continue
    const labels = svc.labels ? normalizeLabels(svc.labels as Record<string, string> | string[]) : {}
    const ports = (svc.ports ?? []).map(p => parsePortMapping(String(p))).filter(Boolean) as Array<{ hostPort: number; containerPort: number }>
    const image = svc.image ?? serviceName

    const containerLabels: ContainerLabels = {
      id: serviceName,
      name: serviceName,
      image,
      labels,
      networks: [{ ip: '127.0.0.1', name: 'default' }],
      ports: ports.map(p => ({ ...p, ip: '127.0.0.1' })),
    }

    // Strategy A: ProxyOS labels
    const proxyosLabels = parseProxyOSLabels(labels)
    if (proxyosLabels) {
      routes.push(proxyOSLabelsToRoute(proxyosLabels, serviceName, '127.0.0.1'))
      continue
    }

    // Strategy B: Traefik labels
    const traefikRoutes = scanDockerForTraefikLabels([containerLabels])
    if (traefikRoutes.length > 0) {
      routes.push(...traefikRoutes)
      continue
    }

    // Strategy C: Heuristic — expose host-mapped HTTP ports
    for (const port of ports) {
      if (port.hostPort > 0 && isLikelyHTTP(port.containerPort)) {
        routes.push({
          domain: `${serviceName}.local`,
          upstream: `127.0.0.1:${port.hostPort}`,
          protocol: 'http',
          tlsDetected: false,
          suggestedTlsMode: 'auto',
          ssoDetected: false,
          basicAuthDetected: false,
          compressionDetected: false,
          websocketDetected: false,
          rateLimitDetected: false,
          sourceType: 'caddy',
          sourceIdentifier: `compose:${serviceName}`,
          confidence: 'low',
          warnings: ['Heuristic detection — review domain before exposing'],
          canAutoImport: false,
        })
        break
      }
    }
  }

  return routes
}

/** Minimal YAML-subset parser — handles indented key:value and list items */
function parseMinimalYAML(content: string): unknown {
  const lines = content.split('\n')
  const root: Record<string, unknown> = {}
  const stack: Array<{ obj: Record<string, unknown>; indent: number }> = [{ obj: root, indent: -1 }]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (!line.trim() || line.trimStart().startsWith('#')) continue

    const indent = line.length - line.trimStart().length
    const trimmed = line.trimStart()

    // Pop stack to matching indent
    while (stack.length > 1 && indent <= (stack[stack.length - 1]?.indent ?? -1)) {
      stack.pop()
    }

    const current = stack[stack.length - 1]?.obj
    if (!current) continue

    if (trimmed.startsWith('- ')) {
      // List item
      const val = trimmed.slice(2).trim()
      // Find the parent key (last array)
      const parentKey = Object.keys(current).at(-1)
      if (parentKey) {
        if (!Array.isArray(current[parentKey])) current[parentKey] = []
        ;(current[parentKey] as unknown[]).push(parseScalar(val))
      }
    } else {
      const colonIdx = trimmed.indexOf(':')
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim()
        const rest = trimmed.slice(colonIdx + 1).trim()
        if (rest === '' || rest === '|' || rest === '>') {
          // Nested object
          const nested: Record<string, unknown> = {}
          current[key] = nested
          stack.push({ obj: nested, indent })
        } else {
          current[key] = parseScalar(rest)
        }
      }
    }
  }

  return root
}

function parseScalar(val: string): unknown {
  if (val === 'true') return true
  if (val === 'false') return false
  if (val === 'null' || val === '~') return null
  const n = Number(val)
  if (!isNaN(n) && val.length > 0) return n
  return val.replace(/^["']|["']$/g, '')
}
