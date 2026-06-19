// Minimal, dependency-free Markdown renderer for the legal pages. Supports the
// subset used by the documents in src/content/*.md: ## h2, ### h3, "- "/"* "
// bullets, "> " blockquotes, blank-line paragraphs, **bold**, and [text](href)
// links. Not a general-purpose parser.

function renderInline(text, keyPrefix) {
  const nodes = []
  const regex = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let m
  let i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1]) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`} className="font-bold text-ink">{m[2]}</strong>)
    } else {
      const href = m[5]
      const external = /^https?:\/\//.test(href)
      nodes.push(
        <a
          key={`${keyPrefix}-l${i}`}
          href={href}
          className="font-semibold text-primary-deep underline underline-offset-2 hover:text-primary"
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {m[4]}
        </a>,
      )
    }
    last = m.index + m[0].length
    i += 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ source }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let list = null
  let quote = null

  lines.forEach((raw) => {
    const line = raw.trimEnd()
    if (/^[-*] /.test(line)) {
      if (!list) {
        list = []
        blocks.push({ type: 'ul', items: list })
      }
      list.push(line.slice(2))
      quote = null
      return
    }
    if (/^> /.test(line)) {
      if (!quote) {
        quote = []
        blocks.push({ type: 'quote', items: quote })
      }
      quote.push(line.slice(2))
      list = null
      return
    }
    list = null
    quote = null
    if (line.trim() === '') return
    if (/^### /.test(line)) blocks.push({ type: 'h3', text: line.slice(4) })
    else if (/^## /.test(line)) blocks.push({ type: 'h2', text: line.slice(3) })
    else blocks.push({ type: 'p', text: line })
  })

  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        if (b.type === 'h2') {
          return (
            <h2 key={i} className="mt-8 text-xl font-extrabold text-ink sm:text-2xl">
              {renderInline(b.text, `h${i}`)}
            </h2>
          )
        }
        if (b.type === 'h3') {
          return (
            <h3 key={i} className="mt-4 text-lg font-bold text-ink">
              {renderInline(b.text, `h${i}`)}
            </h3>
          )
        }
        if (b.type === 'ul') {
          return (
            <ul key={i} className="list-disc space-y-1.5 ps-5 leading-relaxed text-ink-soft marker:text-primary">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it, `li${i}-${j}`)}</li>
              ))}
            </ul>
          )
        }
        if (b.type === 'quote') {
          return (
            <blockquote key={i} className="rounded-e-lg border-s-4 border-primary/40 bg-mist/50 px-4 py-2.5 leading-relaxed text-ink-soft">
              {b.items.map((it, j) => (
                <p key={j}>{renderInline(it, `q${i}-${j}`)}</p>
              ))}
            </blockquote>
          )
        }
        return (
          <p key={i} className="leading-relaxed text-ink-soft">
            {renderInline(b.text, `p${i}`)}
          </p>
        )
      })}
    </div>
  )
}
