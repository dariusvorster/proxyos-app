import { Topbar, PageContent } from '~/components/shell'
import { getDoc, getIndexDoc, buildSearchIndex } from '../_lib/docs'
import DocsSidebar from '../_components/DocsSidebar'
import DocsMarkdown from '../_components/DocsMarkdown'
import { notFound } from 'next/navigation'

const GITHUB_REPO = 'dariusvorster/proxyos-app'

interface Props {
  params: Promise<{ path?: string[] }>
}

export default async function DocsPage({ params }: Props) {
  const { path: segments = [] } = await params
  const doc = segments.length === 0 ? getIndexDoc() : getDoc(segments)
  if (!doc) notFound()

  const index = buildSearchIndex()
  const editPath = segments.length === 0 ? 'index' : segments.join('/')
  const editUrl = `https://github.com/${GITHUB_REPO}/edit/main/docs/${editPath}.md`

  return (
    <>
      <Topbar title={doc.title} />
      <PageContent>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 32, alignItems: 'start' }}>
          <DocsSidebar index={index} />
          <article style={{ maxWidth: 760, minWidth: 0 }}>
            <DocsMarkdown content={doc.markdown} />
            <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <a
                href={editUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-sans)', textDecoration: 'none' }}
              >
                Edit this page on GitHub ↗
              </a>
            </div>
          </article>
        </div>
      </PageContent>
    </>
  )
}
