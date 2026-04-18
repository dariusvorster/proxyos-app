'use client'

import { use, useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card } from '~/components/ui'
import { trpc } from '~/lib/trpc'

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'neutral'

const STATUS_TONE: Record<string, BadgeTone> = {
  connected: 'green',
  pending: 'amber',
  offline: 'neutral',
  revoked: 'red',
}

export default function SiteNodesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: siteId } = use(params)

  const { data: nodes, refetch } = trpc.nodes.list.useQuery({ siteId })
  const { data: connectedIds } = trpc.nodes.connectedIds.useQuery()
  const createTokenMutation = trpc.nodes.createEnrollmentToken.useMutation()
  const revokeMutation = trpc.nodes.revoke.useMutation({ onSuccess: () => refetch() })
  const pingMutation = trpc.nodes.ping.useMutation()

  const [showForm, setShowForm] = useState(false)
  const [expiresInHours, setExpiresInHours] = useState(24)
  const [generatedToken, setGeneratedToken] = useState<{ token: string; expiresAt: string } | null>(null)

  function handleGenerateToken(e: React.FormEvent) {
    e.preventDefault()
    createTokenMutation.mutate(
      { siteId, expiresInHours },
      {
        onSuccess: (data) => {
          setGeneratedToken(data)
          void refetch()
        },
      },
    )
  }

  const composeSnippet = generatedToken
    ? `services:
  proxyos:
    image: ghcr.io/proxyos/proxyos:latest
    container_name: proxyos-node
    restart: unless-stopped
    network_mode: host
    environment:
      PROXYOS_MODE: node
      PROXYOS_CENTRAL_URL: wss://your-central.example.com/federation/v1
      PROXYOS_AGENT_TOKEN: ${generatedToken.token}
      PROXYOS_SECRET: \${PROXYOS_SECRET}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - proxyos-node-data:/data/proxyos
      - caddy-data:/data/caddy
      - caddy-config:/config/caddy
volumes:
  proxyos-node-data:
  caddy-data:
  caddy-config:`
    : ''

  return (
    <>
      <Topbar title="Nodes" />
      <PageContent>
        <PageHeader
          title="Nodes"
          desc={`Remote ProxyOS instances managed by this site.`}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowForm((v) => !v); setGeneratedToken(null) }}
          >
            {showForm ? 'Cancel' : '+ Add node'}
          </Button>
        </div>

        {showForm && (
          <Card>
            <div style={{ padding: '12px 14px' }}>
              {!generatedToken ? (
                <form onSubmit={handleGenerateToken} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>Token expires in:</span>
                  <select
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(Number(e.target.value))}
                    style={{
                      padding: '4px 8px',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text)',
                      fontSize: 12,
                    }}
                  >
                    <option value={1}>1 hour</option>
                    <option value={24}>24 hours</option>
                    <option value={168}>7 days</option>
                  </select>
                  <Button type="submit" variant="primary" size="sm" disabled={createTokenMutation.isPending}>
                    {createTokenMutation.isPending ? 'Generating…' : 'Generate token'}
                  </Button>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    Token expires: {new Date(generatedToken.expiresAt).toLocaleString()} — shown once, copy now.
                  </div>
                  <pre style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: 10,
                    color: 'var(--text)',
                    overflowX: 'auto',
                    whiteSpace: 'pre',
                    margin: 0,
                  }}>
                    {composeSnippet}
                  </pre>
                </div>
              )}
            </div>
          </Card>
        )}

        {(!nodes || nodes.length === 0) ? (
          <Card>
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              No nodes enrolled yet. Click &quot;+ Add node&quot; to generate an enrollment token.
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {nodes.map((node) => {
              const isLive = connectedIds?.includes(node.id)
              const displayStatus = isLive ? 'connected' : node.status
              return (
                <Card key={node.id}>
                  <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {node.name}
                      </span>
                      <span style={{ marginLeft: 8 }}>
                        <Badge tone={STATUS_TONE[displayStatus] ?? 'neutral'}>{displayStatus}</Badge>
                      </span>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {node.hostname && (
                          <><code style={{ fontFamily: 'var(--font-mono)' }}>{node.hostname}</code>{' · '}</>
                        )}
                        {node.agentVersion && <>{node.agentVersion}{' · '}</>}
                        {`config v${node.configVersionApplied ?? 0}`}
                        {node.lastHeartbeatAt && (
                          <>{' · last seen '}{new Date(node.lastHeartbeatAt).toLocaleTimeString()}</>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={displayStatus !== 'connected' || pingMutation.isPending}
                        onClick={() => pingMutation.mutate({ nodeId: node.id })}
                      >
                        Ping
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={node.status === 'revoked' || revokeMutation.isPending}
                        onClick={() => {
                          if (confirm(`Revoke node "${node.name}"? It will be disconnected and cannot reconnect.`)) {
                            revokeMutation.mutate({ nodeId: node.id })
                          }
                        }}
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </PageContent>
    </>
  )
}
