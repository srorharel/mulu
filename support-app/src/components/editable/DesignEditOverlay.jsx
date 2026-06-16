import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { isDesignEditMode, exitDesignEditMode } from '../../lib/designEditMode.js'

const PROPERTIES = [
  { key: 'color',         label: 'Color',         input: 'color' },
  { key: 'bg',            label: 'Background',    input: 'color' },
  { key: 'text_size',     label: 'Text size (em)',input: 'range', min: 0.7, max: 1.5, step: 0.05, default: 1 },
  { key: 'padding',       label: 'Padding (px)',  input: 'range', min: 0,   max: 48,  step: 1,    default: 8 },
  { key: 'border_radius', label: 'Radius (px)',   input: 'range', min: 0,   max: 32,  step: 1,    default: 8 },
  { key: 'offset_x',      label: 'Offset X (px)', input: 'range', min: -100,max: 100, step: 1,    default: 0 },
  { key: 'offset_y',      label: 'Offset Y (px)', input: 'range', min: -100,max: 100, step: 1,    default: 0 },
]

export default function DesignEditOverlay({ app }) {
  const [active, setActive] = useState(isDesignEditMode())
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!active) return
    function onOpen(e) { setOpenId(e.detail?.id ?? null); setError(null) }
    window.addEventListener('design-edit-open', onOpen)
    return () => window.removeEventListener('design-edit-open', onOpen)
  }, [active])

  if (!active) return null

  async function save(property, value) {
    setBusy(true); setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('admin_set_design_override', {
        p_app: app, p_id: openId, p_property: property, p_value: { value },
      })
      if (rpcErr) throw rpcErr
    } catch (e) { setError(e.message) }
    finally    { setBusy(false) }
  }
  async function clear(property) {
    setBusy(true); setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('admin_clear_design_override', {
        p_app: app, p_id: openId, p_property: property,
      })
      if (rpcErr) throw rpcErr
    } catch (e) { setError(e.message) }
    finally    { setBusy(false) }
  }

  return (
    <>
      {openId && (
        <aside className="fixed top-12 right-4 z-[101] w-[280px] bg-white text-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 p-4">
          <div className="flex items-center mb-3">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 flex-1 truncate" title={openId}>{openId}</p>
            <button onClick={() => setOpenId(null)} className="text-zinc-500 hover:text-zinc-900 px-2">×</button>
          </div>
          {error && <p className="text-[11px] text-red-600 mb-2 font-mono">{error}</p>}
          <div className="flex flex-col gap-2">
            {PROPERTIES.map(p => (
              <div key={p.key} className="flex flex-col gap-0.5">
                <label className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                  {p.label}
                  <button onClick={() => clear(p.key)} className="ms-auto text-[9px] text-zinc-400 hover:text-red-600" title="Reset to default">reset</button>
                </label>
                {p.input === 'color' ? (
                  <input type="color" onChange={e => save(p.key, e.target.value)} disabled={busy} />
                ) : (
                  <input type="range" min={p.min} max={p.max} step={p.step} defaultValue={p.default}
                    onChange={e => save(p.key, Number(e.target.value))} disabled={busy} />
                )}
              </div>
            ))}
          </div>
        </aside>
      )}
      <div className="fixed bottom-0 inset-x-0 z-[100] bg-amber-500 text-amber-950 text-[12px] font-semibold px-4 py-2 flex items-center justify-center gap-3 shadow-[0_-2px_8px_rgba(0,0,0,0.15)]">
        <span>🎨 Design edit mode. Tap any registered element to override its style</span>
        <button
          onClick={() => { exitDesignEditMode(); setActive(false); window.location.reload() }}
          className="underline font-bold"
        >
          Exit edit mode
        </button>
      </div>
    </>
  )
}
