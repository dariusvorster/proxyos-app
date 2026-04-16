export interface ContainerNetwork {
  ip: string
  name: string
}

export interface PortMapping {
  hostPort: number
  containerPort: number
  ip: string
}

export interface ScannerContainer {
  id: string
  name: string
  image: string
  status: string
  networks: ContainerNetwork[]
  ports: PortMapping[]
  labels: Record<string, string>
}

/**
 * Resolve the upstream address ProxyOS should use to reach a container.
 *
 * Priority:
 * 1. If ProxyOS shares a Docker network with the container → use container IP on that network
 * 2. If container has a host port mapping → use 127.0.0.1:hostPort
 * 3. If container is on host network → use 127.0.0.1:port
 * 4. Fallback → 127.0.0.1:port
 */
export function resolveUpstream(container: ScannerContainer, port: number, proxyosNetworks: string[] = []): string {
  // 1. Shared Docker network
  const sharedNetwork = container.networks.find(n => proxyosNetworks.includes(n.name))
  if (sharedNetwork?.ip) return `${sharedNetwork.ip}:${port}`

  // 2. Host port mapping
  const mapping = container.ports.find(p => p.containerPort === port)
  if (mapping?.hostPort) return `127.0.0.1:${mapping.hostPort}`

  // 3. Any available network IP
  const firstIp = container.networks[0]?.ip
  if (firstIp) return `${firstIp}:${port}`

  // 4. Fallback
  return `127.0.0.1:${port}`
}

/**
 * Detect if a container port is likely an HTTP service worth proxying.
 * Returns false for known DB/cache/queue ports.
 */
export function isLikelyHTTP(port: number): boolean {
  const nonHTTP = new Set([
    3306, 5432, 1433, 1521,   // databases
    6379, 11211, 27017,        // redis, memcached, mongo
    5672, 15672, 4369,         // rabbitmq
    9092, 2181,                // kafka/zookeeper
    22, 23, 21, 25, 587, 993,  // ssh, ftp, smtp, imap
  ])
  return !nonHTTP.has(port)
}
