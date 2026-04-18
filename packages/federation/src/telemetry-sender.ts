import { randomUUID } from 'crypto'
import * as http from 'http'
import type { FederationClient } from './client'

let timer: ReturnType<typeof setInterval> | null = null

interface DockerContainerSummary {
  Id: string
  Names?: string[]
  Image: string
  Ports?: Array<{ PrivatePort?: number; Type?: string }>
  NetworkSettings?: { Networks?: Record<string, unknown> }
}

async function listContainers(socketPath: string): Promise<DockerContainerSummary[]> {
  return new Promise((resolve) => {
    const req = http.request(
      { socketPath, path: '/containers/json?all=false', method: 'GET' },
      (res) => {
        let raw = ''
        res.on('data', (d: Buffer) => { raw += d.toString() })
        res.on('end', () => {
          try { resolve(JSON.parse(raw) as DockerContainerSummary[]) }
          catch { resolve([]) }
        })
      },
    )
    req.on('error', () => resolve([]))
    req.end()
  })
}

export function startTelemetry(client: FederationClient, intervalS = 60): void {
  stopTelemetry()
  const socketPath = '/var/run/docker.sock'

  const push = async () => {
    const containers = await listContainers(socketPath)
    if (containers.length === 0) return
    client.send({
      type: 'telemetry.containers',
      request_id: randomUUID(),
      payload: {
        containers: containers.map(c => ({
          id: c.Id.slice(0, 12),
          name: (c.Names?.[0] ?? '').replace(/^\//, ''),
          image: c.Image,
          networks: Object.keys(c.NetworkSettings?.Networks ?? {}),
          ports: (c.Ports ?? []).map(p => ({ port: p.PrivatePort ?? 0, protocol: p.Type ?? 'tcp' })),
        })),
        networks: [],
      },
    })
  }

  void push()
  timer = setInterval(() => void push(), intervalS * 1000)
}

export function stopTelemetry(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
