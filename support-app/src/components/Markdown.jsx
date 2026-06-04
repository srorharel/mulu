import { Fragment } from 'react'

// Minimal, dependency-free Markdown renderer (support-app copy — the two Vite
// apps don't share a component tree). Supports # / ## / ### headings,
// > blockquotes, - / * bullet lists, **bold**, *italic*, and paragraphs.

function renderInline(text, keyPrefix) {
  const nodes = []
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g
  let lastIndex = 0
  let m
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(<Fragment key={`${keyPrefix}-t-${i}`}>{text.slice(lastIndex, m.index)}</Fragment>)
    }
    if (m[2] != null) nodes.push(<strong key={`${keyPrefix}-b-${i}`}>{m[2]}</strong>)
    else              nodes.push(<em key={`${keyPrefix}-i-${i}`}>{m[3]}</em>)
    lastIndex = m.index + m[0].length
    i++
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t-end`}>{text.slice(lastIndex)}</Fragment>)
  }
  return nodes
}

export default function Markdown({ content, className = '' }) {
  const blocks = String(content || '').replace(/\r\n/g, '\n').split(/\n{2,}/)

  return (
    <div className={className}>
      {blocks.map((raw, bi) => {
        const block = raw.trim()
        if (!block) return null
        const lines = block.split('\n')

        if (/^###\s+/.test(block))
          return <h3 key={bi} className="text-[15px] font-bold text-ink mt-4 mb-1">{renderInline(block.replace(/^###\s+/, ''), `h3-${bi}`)}</h3>
        if (/^##\s+/.test(block))
          return <h2 key={bi} className="text-[17px] font-bold text-ink mt-5 mb-1.5">{renderInline(block.replace(/^##\s+/, ''), `h2-${bi}`)}</h2>
        if (/^#\s+/.test(block))
          return <h1 key={bi} className="text-xl font-extrabold text-ink mt-2 mb-2">{renderInline(block.replace(/^#\s+/, ''), `h1-${bi}`)}</h1>

        if (lines.every(l => /^>\s?/.test(l))) {
          const inner = lines.map(l => l.replace(/^>\s?/, '')).join(' ')
          return (
            <blockquote key={bi} className="border-s-4 border-agent/40 ps-3 my-3 text-sm text-ink-muted">
              {renderInline(inner, `bq-${bi}`)}
            </blockquote>
          )
        }

        if (lines.every(l => /^[-*]\s+/.test(l))) {
          return (
            <ul key={bi} className="list-disc ms-5 my-2 flex flex-col gap-1 text-sm text-ink">
              {lines.map((l, li) => <li key={li}>{renderInline(l.replace(/^[-*]\s+/, ''), `li-${bi}-${li}`)}</li>)}
            </ul>
          )
        }

        return (
          <p key={bi} className="text-sm text-ink leading-relaxed my-2">
            {renderInline(lines.join(' '), `p-${bi}`)}
          </p>
        )
      })}
    </div>
  )
}
