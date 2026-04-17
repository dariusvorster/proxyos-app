import { readFile } from 'fs/promises'
import { publicProcedure, router } from '../trpc'
import { dockerRequest } from '../automation/network-join'

interface DockerContainerDetail {
  Id: string
  Names: string[]
  Image: string
  State: string
  Status: string
  NetworkSettings: {
    Networks: Record<
      string,
      {
        NetworkID: string
        IPAddress: string
        Aliases: string[] | null
      }
    >
  }
  Ports: Array<{
    IP?: string
    PrivatePort: number
    PublicPort?: number
    Type: string
  }>
  Labels: Record<string, string>
}

interface DockerNetworkForSelf {
  Id: string
  Name: string
  Containers: Record<string, { Name: string; IPv4Address: string }>
}

async function getSelfContainerId(socketPath: string): Promise<string | null> {
  try {
    const hostname = (await readFile('/etc/hostname', 'utf-8')).trim()
    const info = await dockerRequest<{ Id: string }>(
      socketPath,
      'GET',
      `/containers/${hostname}/json`,
    )
    return info.Id
  } catch {
    return null
  }
}

export interface DiscoverableContainer {
  id: string
  name: string
  image: string
  state: string
  status: string
  sharedNetworks: string[]
  ports: Array<{
    internalPort: number
    protocol: string
    exposedOnHost: boolean
    hostPort?: number
    suggestedUpstream: string
  }>
  labels: Record<string, string>
}

export const containersRouter = router({
  listDiscoverable: publicProcedure.query(async (): Promise<{
    socketMounted: boolean
    containers: DiscoverableContainer[]
    error?: string
  }> => {
    const socketPath = '/var/run/docker.sock'

    const selfId = await getSelfContainerId(socketPath)
    if (!selfId) {
      return {
        socketMounted: false,
        containers: [],
        error:
          'Docker socket not mounted or ProxyOS not running in Docker. Mount /var/run/docker.sock to enable container discovery.',
      }
    }

    // Find networks ProxyOS is joined to
    let networkSummaries: Array<{ Id: string; Name: string }>
    try {
      networkSummaries = await dockerRequest<Array<{ Id: string; Name: string }>>(
        socketPath,
        'GET',
        '/networks',
      )
    } catch (e) {
      return {
        socketMounted: true,
        containers: [],
        error: `Failed to list networks: ${e instanceof Error ? e.message : String(e)}`,
      }
    }

    // Inspect each network to find which ones have ProxyOS as a member
    const inspected = await Promise.allSettled(
      networkSummaries.map((n) =>
        dockerRequest<DockerNetworkForSelf>(socketPath, 'GET', `/networks/${n.Id}`),
      ),
    )

    const selfShort = selfId.slice(0, 12)
    const proxyosNetworks = new Map<string, string>() // networkId -> networkName
    for (const result of inspected) {
      if (result.status !== 'fulfilled') continue
      const net = result.value
      const hasProxyos = Object.keys(net.Containers ?? {}).some(
        (id) => id === selfId || id.startsWith(selfShort),
      )
      if (hasProxyos) {
        proxyosNetworks.set(net.Id, net.Name)
      }
    }

    // List all running containers
    let allContainers: DockerContainerDetail[]
    try {
      allContainers = await dockerRequest<DockerContainerDetail[]>(
        socketPath,
        'GET',
        '/containers/json?all=false',
      )
    } catch (e) {
      return {
        socketMounted: true,
        containers: [],
        error: `Failed to list containers: ${e instanceof Error ? e.message : String(e)}`,
      }
    }

    // Filter to containers that share at least one network with ProxyOS (and aren't ProxyOS itself)
    const discoverable: DiscoverableContainer[] = []
    for (const c of allContainers) {
      if (c.Id === selfId || c.Id.startsWith(selfShort)) continue

      const containerNetworkIds = Object.values(c.NetworkSettings.Networks).map((n) => n.NetworkID)
      const sharedNetworks = containerNetworkIds
        .filter((id) => proxyosNetworks.has(id))
        .map((id) => proxyosNetworks.get(id)!)

      if (sharedNetworks.length === 0) continue

      // Deduplicate ports by PrivatePort + Type
      const portMap = new Map<string, DiscoverableContainer['ports'][0]>()
      for (const p of c.Ports ?? []) {
        const key = `${p.PrivatePort}/${p.Type}`
        if (portMap.has(key)) continue

        const containerName = c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12)
        const scheme = p.PrivatePort === 443 || p.PrivatePort === 8443 ? 'https' : 'http'
        portMap.set(key, {
          internalPort: p.PrivatePort,
          protocol: p.Type,
          exposedOnHost: p.PublicPort !== undefined,
          hostPort: p.PublicPort,
          suggestedUpstream: `${scheme}://${containerName}:${p.PrivatePort}`,
        })
      }

      const containerName = c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12)
      discoverable.push({
        id: c.Id,
        name: containerName,
        image: c.Image,
        state: c.State,
        status: c.Status,
        sharedNetworks,
        ports: Array.from(portMap.values()).sort((a, b) => a.internalPort - b.internalPort),
        labels: c.Labels ?? {},
      })
    }

    // Sort alphabetically by name
    discoverable.sort((a, b) => a.name.localeCompare(b.name))

    return {
      socketMounted: true,
      containers: discoverable,
    }
  }),
})
