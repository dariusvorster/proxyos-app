'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const prose: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  color: 'var(--text2)',
  fontSize: 13,
  lineHeight: 1.75,
}

export default function DocsMarkdown({ content }: { content: string }) {
  return (
    <div style={prose} className="docs-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
