// admin-app/src/pages/DesignEditor.jsx
//
// SECURITY NOTE — read before changing:
// The passphrase gate in this file is a SOFT GATE intended to prevent
// accidental entry to the design editor. It is NOT a security boundary.
// Anyone with browser DevTools can bypass this prompt — the actual write
// protection is the super_admin RLS policy on `design_overrides` (0088) and
// the bound-validating `admin_set_design_override` RPC (0089). That's
// accepted: a super_admin already has full write authority via every other
// admin tab; the gate exists so they don't accidentally drop into a mode
// where every tap rewrites styles.

import { useEffect, useState } from 'react'
import { Palette, AlertCircle, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fetchAllDesignOverrides, resetAllOverrides } from '../lib/designEditor.js'
import SurfacePicker from '../components/design/SurfacePicker.jsx'
import PropertyOverrideRow from '../components/design/PropertyOverrideRow.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import PageHeader from '../components/PageHeader.jsx'

const DESIGN_GATE = '121212'

export default function DesignEditor() {
  // In-memory ONLY — closing the tab re-locks. Not localStorage.
  const [unlocked, setUnlocked] = useState(false)
  const [pwInput, setPwInput]   = useState('')
  const [pwError, setPwError]   = useState(null)

  const [rows, setRows]    = useState([])
  const [busy, setBusy]    = useState(false)
  const [error, setError]  = useState(null)
  const [resetTyped, setResetTyped] = useState('')
  const [showReset, setShowReset]   = useState(false)

  async function load() {
    setBusy(true); setError(null)
    try { setRows(await fetchAllDesignOverrides()) }
    catch (e) { setError(e.message) }
    finally    { setBusy(false) }
  }

  useEffect(() => {
    if (!unlocked) return
    load()
    const ch = supabase
      .channel('design-overrides-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'design_overrides' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [unlocked])

  function tryUnlock(e) {
    e.preventDefault()
    if (pwInput === DESIGN_GATE) { setUnlocked(true); setPwError(null) }
    else { setPwError('Wrong passphrase') }
  }

  async function doReset() {
    setBusy(true); setError(null)
    try { await resetAllOverrides(); setShowReset(false); setResetTyped(''); await load() }
    catch (e) { setError(e.message) }
    finally    { setBusy(false) }
  }

  if (!unlocked) {
    return (
      <div className="h-full flex items-center justify-center p-4 sm:p-6">
        <form onSubmit={tryUnlock} className="w-full max-w-sm card flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Palette size={18} className="text-admin-deep" />
            <h2 className="font-bold text-ink">Design Editor</h2>
          </div>
          <p className="text-[12.5px] text-ink-muted">
            Soft passphrase gate. Prevents accidental entry; not a security boundary.
            The RPC + RLS enforce real write protection.
          </p>
          <input
            type="password"
            autoFocus
            placeholder="Passphrase"
            value={pwInput}
            onChange={e => setPwInput(e.target.value)}
            className="input"
          />
          {pwError && <p className="text-[12px] text-danger">{pwError}</p>}
          <button type="submit" className="btn-primary" disabled={!pwInput}>Unlock</button>
        </form>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        icon={Palette}
        title="Design Editor"
        right={
          <>
            <span className="text-[11px] text-ink-muted tabular-nums">{rows.length} overrides</span>
            <button
              onClick={() => setShowReset(true)}
              className="btn border border-danger/50 text-danger hover:bg-danger/10 text-[12px]"
              disabled={busy || rows.length === 0}
            >
              <RotateCcw size={12} /> Reset all
            </button>
          </>
        }
      >
        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /><span className="font-mono">{error}</span>
          </div>
        )}
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SurfacePicker />
        <section className="card">
          <h2 className="font-semibold text-ink mb-2">Active overrides</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-ink-muted">No overrides yet. Open any surface from the picker → tap the registered element → adjust.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[460px]">
              <thead className="text-ink-subtle text-[10.5px] uppercase tracking-wider">
                <tr>
                  <th className="text-start px-3 py-2">App</th>
                  <th className="text-start px-3 py-2">Id</th>
                  <th className="text-start px-3 py-2">Property</th>
                  <th className="text-start px-3 py-2">Value</th>
                  <th className="text-start px-3 py-2">Edited</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <PropertyOverrideRow key={`${r.app}.${r.id}.${r.property}`} row={r} onChanged={load} />
                ))}
              </tbody>
            </table>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={showReset}
        title="Reset every design override?"
        message={'Deletes ALL rows in design_overrides. Type "RESET DESIGN" below to enable the Reset button.'}
        confirmLabel="RESET DESIGN"
        destructive
        busy={busy}
        confirmDisabled={resetTyped !== 'RESET DESIGN'}
        onCancel={() => { setShowReset(false); setResetTyped('') }}
        onConfirm={() => { if (resetTyped === 'RESET DESIGN') doReset() }}
      >
        <input
          type="text"
          autoFocus
          placeholder="Type RESET DESIGN"
          value={resetTyped}
          onChange={e => setResetTyped(e.target.value)}
          className="input"
        />
      </ConfirmDialog>
    </div>
  )
}
