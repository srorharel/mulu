import { useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { groupedManifest, buildEditUrl } from '../../lib/designEditor.js'

export default function SurfacePicker() {
  const groups = groupedManifest()
  const [query, setQuery] = useState('')

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="font-semibold text-ink">Registered surfaces ({Object.values(groups).flatMap(g => Object.values(g).flat()).length})</h2>
      <div className="flex items-center gap-2 bg-surface rounded-xl border border-edge px-3">
        <Search size={14} className="text-ink-subtle" />
        <input className="flex-1 bg-transparent outline-none text-sm py-2" placeholder="Filter id / label" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="flex flex-col gap-4 max-h-[560px] overflow-y-auto pr-1">
        {Object.entries(groups).map(([app, screens]) => (
          <div key={app}>
            <p className="text-[10.5px] uppercase tracking-wider text-ink-subtle font-bold mb-1">{app} app</p>
            {Object.entries(screens).map(([screen, items]) => (
              <div key={screen} className="mb-2">
                <p className="text-[11.5px] text-ink-muted font-semibold mb-1">{screen}</p>
                <ul className="text-[12px] text-ink-muted space-y-0.5">
                  {items.filter(s => !query || s.id.includes(query) || s.label.toLowerCase().includes(query.toLowerCase())).map(s => (
                    <li key={s.id} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-surface-elevated-2">
                      <span className="flex-1 truncate">
                        <span className="font-mono text-[11px] text-ink-subtle">{s.id}</span>
                        <span className="ms-2 text-ink">{s.label}</span>
                      </span>
                      <a className="btn-ghost text-[11px]" href={buildEditUrl(app, screen)} target="_blank" rel="noreferrer">
                        <ExternalLink size={11} /> Edit live
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
