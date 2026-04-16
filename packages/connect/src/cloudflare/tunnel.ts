import { cfFetch } from './client'

export interface CfTunnel {
  id: string
  name: string
  status: string
}

interface TunnelIngress {
  hostname?: string
  service: string
  originRequest?: Record<string, unknown>
}

interface TunnelConfig {
  ingress: TunnelIngress[]
}

export async function cfListTunnels(token: string, accountId: string): Promise<CfTunnel[]> {
  return cfFetch<CfTunnel[]>(token, `/accounts/${accountId}/cfd_tunnel?status=active`)
}

export async function cfGetTunnelConfig(token: string, accountId: string, tunnelId: string): Promise<TunnelConfig> {
  const result = await cfFetch<{ config: TunnelConfig }>(
    token, `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
  )
  return result.config ?? { ingress: [{ service: 'http_status:404' }] }
}

export async function cfUpsertTunnelRoute(
  token: string, accountId: string, tunnelId: string,
  hostname: string, service: string,
): Promise<void> {
  const config = await cfGetTunnelConfig(token, accountId, tunnelId)
  const others = config.ingress.filter(r => r.hostname !== hostname && r.service !== 'http_status:404')
  await cfFetch<unknown>(token, `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
    method: 'PUT',
    body: JSON.stringify({ config: { ingress: [...others, { hostname, service }, { service: 'http_status:404' }] } }),
  })
}

export async function cfRemoveTunnelRoute(
  token: string, accountId: string, tunnelId: string, hostname: string,
): Promise<void> {
  const config = await cfGetTunnelConfig(token, accountId, tunnelId)
  const others = config.ingress.filter(r => r.hostname !== hostname && r.service !== 'http_status:404')
  await cfFetch<unknown>(token, `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
    method: 'PUT',
    body: JSON.stringify({ config: { ingress: [...others, { service: 'http_status:404' }] } }),
  })
}
