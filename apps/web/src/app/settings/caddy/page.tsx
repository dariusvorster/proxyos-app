'use client'

import Link from 'next/link'
import { Button, Card } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

export default function CaddySettingsPage() {
  const [handleError] = useErrorHandler()
  const config = trpc.caddy.config.useQuery(undefined, { refetchInterval: 10_000, retry: false })
  const status = trpc.caddy.status.useQuery(undefined, { refetchInterval: 5000 })
  const rootCA = trpc.caddy.rootCA.useQuery(undefined, { retry: false }) as { data?: { root_certificate?: string } }
  const utils = trpc.useUtils()
  const reload = trpc.caddy.reload.useMutation({ onSuccess: () => { utils.caddy.config.invalidate() }, onError: handleError })

  return (
    <>
      <Topbar
        title="Caddy"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/settings" style={{ fontSize: 11, color: 'var(--accent)' }}>← Settings</Link>
            <Button
            variant="primary"
            onClick={() => reload.mutate()}
            disabled={reload.isPending || !status.data?.reachable}
          >
            {reload.isPending ? 'Reloading…' : 'Rebuild from DB'}
          </Button>
          </div>
        }
      />
      <PageContent>
        <Card>
          <div style={{ display: 'flex', gap: 28, fontSize: 12 }}>
            <span>Status: <strong style={{ color: status.data?.reachable ? 'var(--green)' : 'var(--red)' }}>{status.data?.reachable ? 'reachable' : 'unreachable'}</strong></span>
            <span>Server &quot;main&quot;: <strong style={{ color: status.data?.hasMain ? 'var(--green)' : 'var(--red)' }}>{status.data?.hasMain ? 'present' : 'absent'}</strong></span>
            <span>Routes: <strong>{status.data?.upstreamCount ?? '—'}</strong></span>
          </div>
        </Card>

        {rootCA.data && (
          <Card header={<span>Internal CA</span>}>
            <div style={{ fontSize: 11 }}>
              {rootCA.data.root_certificate ? (
                <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
{rootCA.data.root_certificate}
                </pre>
              ) : (
                <span style={{ color: 'var(--text-dim)' }}>No internal CA certificate found.</span>
              )}
            </div>
          </Card>
        )}

        <Card header={<span>Raw config JSON</span>}>
          {config.error && <div style={{ color: 'var(--red)', fontSize: 11 }}>Failed to load: {String(config.error.message)}</div>}
          {config.data != null && (
            <pre style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
              maxHeight: 600, overflow: 'auto',
            }}>
{JSON.stringify(config.data as object, null, 2)}
            </pre>
          )}
        </Card>
      </PageContent>
    </>
  )
}
