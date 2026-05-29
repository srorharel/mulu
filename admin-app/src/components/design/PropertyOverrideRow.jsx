import { RotateCcw } from 'lucide-react'
import { relativeTime } from '../../lib/relativeTime.js'
import { clearOverride } from '../../lib/designEditor.js'

export default function PropertyOverrideRow({ row, onChanged }) {
  async function reset() {
    try { await clearOverride({ app: row.app, id: row.id, property: row.property }); onChanged?.() }
    catch { /* swallow — caller can resync via realtime */ }
  }
  return (
    <tr className="border-b border-edge hover:bg-surface-elevated-2/50 group">
      <td className="px-3 py-2 font-mono text-[11px] text-ink-muted">{row.app}</td>
      <td className="px-3 py-2 font-mono text-[11.5px] text-ink-muted">{row.id}</td>
      <td className="px-3 py-2 text-[11.5px] text-ink">{row.property}</td>
      <td className="px-3 py-2 text-[11.5px] text-ink font-mono">{String(row.value?.value ?? '')}</td>
      <td className="px-3 py-2 text-[10.5px] text-ink-subtle">
        {row.editor?.full_name || '—'}{row.updated_at ? `, ${relativeTime(row.updated_at)}` : ''}
      </td>
      <td className="px-3 py-2 text-end">
        <button onClick={reset} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-lg text-ink-muted hover:text-danger transition">
          <RotateCcw size={10} /> reset
        </button>
      </td>
    </tr>
  )
}
