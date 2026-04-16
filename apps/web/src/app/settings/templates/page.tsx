'use client'

import { useState, Fragment } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, DataTable, Input, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function TemplatesPage() {
  const utils = trpc.useUtils()
  const list = trpc.templates.list.useQuery()
  const del = trpc.templates.delete.useMutation({
    onSuccess: () => utils.templates.list.invalidate(),
  })

  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <>
      <Topbar
        title="Route templates"
        actions={<Link href="/settings" style={{ fontSize: 11, color: 'var(--accent)' }}>← Settings</Link>}
      />
      <PageContent>
        <Card>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Templates pre-fill route settings in the expose wizard. Built-in templates cover common homelab patterns. Save any route config as a custom template from the route detail page.
          </div>
        </Card>

        <Card header={<span>Templates</span>} style={{ marginTop: 8 }}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '28%' }}>Name</th>
                <th style={{ ...th, width: '42%' }}>Description</th>
                <th style={{ ...th, width: '15%' }}>Type</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {list.data?.map(t => (
                <Fragment key={t.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                    <td style={{ ...td, fontWeight: 500 }}>{t.name}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 11 }}>{t.description}</td>
                    <td style={td}><Badge tone={t.builtIn ? 'green' : 'neutral'}>{t.builtIn ? 'built-in' : 'custom'}</Badge></td>
                    <td style={td}>
                      {!t.builtIn && (
                        <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); del.mutate({ id: t.id }) }} disabled={del.isPending}>Delete</Button>
                      )}
                    </td>
                  </tr>
                  {expanded === t.id && (
                    <tr>
                      <td colSpan={4} style={{ ...td, background: 'var(--surface-2)' }}>
                        <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 10, margin: 0, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {JSON.stringify(t.config, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>
    </>
  )
}
