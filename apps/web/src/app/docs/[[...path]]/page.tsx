import { Topbar, PageContent } from '~/components/shell'
import { getDoc, getIndexDoc } from '../_lib/docs'
import DocsSidebar from '../_components/DocsSidebar'
import DocsMarkdown from '../_components/DocsMarkdown'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ path?: string[] }>
}

export default async function DocsPage({ params }: Props) {
  const { path: segments = [] } = await params
  const doc = segments.length === 0 ? getIndexDoc() : getDoc(segments)
  if (!doc) notFound()

  return (
    <>
      <Topbar title={doc.title} />
      <PageContent>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 32, alignItems: 'start' }}>
          <DocsSidebar />
          <article style={{ maxWidth: 760, minWidth: 0 }}>
            <DocsMarkdown content={doc.markdown} />
          </article>
        </div>
      </PageContent>
    </>
  )
}
