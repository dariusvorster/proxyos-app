import type { ChainNode, ChainNodeStatus } from '@proxyos/connect'

const STATUS_ORDER: ChainNodeStatus[] = ['error', 'warning', 'unknown', 'ok']

export function rollupStatus(nodes: ChainNode[]): ChainNodeStatus {
  if (nodes.length === 0) return 'unknown'
  for (const s of STATUS_ORDER) {
    if (nodes.some((n) => n.status === s)) return s
  }
  return 'ok'
}

export function chainSummary(nodes: ChainNode[]): string {
  const rollup = rollupStatus(nodes)
  if (rollup === 'ok') return 'All nodes healthy'
  const bad = nodes.filter((n) => n.status !== 'ok')
  return bad.map((n) => `${n.label}: ${n.warning ?? n.status}`).join('; ')
}
