import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SlidersHorizontal, Save, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

// Hints surface in the admin UI so the operator understands the constraint.
const KNOB_HINTS = {
  pricing_source: {
    label: 'Pricing source',
    hint: "Switch the trigger between the hardcoded CASE statements (safe, today's behavior) and reading from pricing_config / payout_tier_config tables. Leave on 'hardcoded' until pricing parity is verified end-to-end.",
    type: 'string',
    options: ['hardcoded', 'config'],
    warn: true,
  },
  nearby_job_radius_meters: {
    label: 'Nearby-job radius (m)',
    hint: 'Used by find_nearby_washers_for_order when the Edge Function does not pass an explicit radius. Affects job offers immediately on next call.',
    type: 'number',
  },
  arrival_geofence_meters: {
    label: 'Arrival geofence (m)',
    hint: 'Maximum distance a washer can be from the order pin to transition en_route → arrived. Affects every new arrival check.',
    type: 'number',
  },
  decline_auto_escalate_count: {
    label: 'Auto-escalate after N declines',
    hint: 'A support ticket is opened automatically after this many agent declines of the same order.',
    type: 'number',
  },
  rating_gate_jobs: {
    label: 'Tier activates after N rated jobs',
    hint: 'Washers below this number of ratings earn the unrated default payout and have no tier set.',
    type: 'number',
  },
  signed_url_ttl_seconds: {
    label: 'Signed-URL TTL (s)',
    hint: 'TTL for job-evidence signed URLs surfaced in the consumer rating modal.',
    type: 'number',
  },
}

export default function Config() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [pricing, setPricing] = useState([])
  const [payouts, setPayouts] = useState([])

  async function refresh() {
    setBusy(true)
    const [c, p, pt] = await Promise.all([
      supabase.from('app_config').select('key, value, value_type, updated_at').order('key'),
      supabase.from('pricing_config').select('category, consumer_price, worker_price, platform_fee, updated_at').order('category'),
      supabase.from('payout_tier_config').select('tier, payout, updated_at').order('tier'),
    ])
    setBusy(false)
    if (c.error) { setError(c.error.message); return }
    setError(null)
    setRows(c.data ?? [])
    setPricing(p.data ?? [])
    setPayouts(pt.data ?? [])
  }

  useEffect(() => { refresh() }, [])

  async function saveAppConfig(key, raw) {
    const hint = KNOB_HINTS[key]
    if (!hint) return
    let value
    if (hint.type === 'number') {
      const n = Number(raw)
      if (!Number.isFinite(n)) { setError(`"${raw}" is not a number`); return }
      value = { value: n }
    } else {
      value = { value: String(raw) }
    }
    setError(null)
    const { error: err } = await supabase
      .from('app_config')
      .update({ value, updated_by: profile?.id, updated_at: new Date().toISOString() })
      .eq('key', key)
    if (err) { setError(err.message); return }
    setDrafts(d => { const c = { ...d }; delete c[key]; return c })
    refresh()
  }

  const currentSource = useMemo(() => {
    const r = rows.find(r => r.key === 'pricing_source')
    return r?.value?.value ?? 'hardcoded'
  }, [rows])

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-edge bg-surface-elevated px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={18} className="text-admin" />
          <h1 className="text-lg font-bold tracking-tight">{t('dashboard.tabs.config')}</h1>
        </div>
      </div>

      <div className="p-6 max-w-4xl w-full mx-auto flex flex-col gap-6">
        {/* Mobile-bake reminder */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border border-warning/40 bg-warning/10 text-warning text-sm">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-0.5">Pricing change scope</p>
            <p className="text-warning/90 text-[12.5px] leading-relaxed">
              Only affects jobs from now on; payouts locked at acceptance (ADR-024) stay at the rate they were locked in at.
              Mobile clients display bundled values until next release; consumer/washer apps refetch server prices on every booking.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /><span className="font-mono">{error}</span>
          </div>
        )}

        {/* app_config knobs */}
        <section className="card flex flex-col gap-2">
          <h2 className="font-semibold text-ink mb-1">Runtime knobs</h2>
          {rows.map(r => {
            const hint = KNOB_HINTS[r.key]
            if (!hint) return null
            const current = r.value?.value
            const draft = drafts[r.key] ?? String(current ?? '')
            const dirty = draft !== String(current ?? '')
            return (
              <div key={r.key} className="border-t border-edge first:border-t-0 py-3 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] text-ink-muted">{r.key}</span>
                  {hint.warn && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-warning/20 text-warning">
                      sensitive
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-ink-subtle">{hint.hint}</p>
                <div className="flex items-center gap-2">
                  {hint.options ? (
                    <select
                      className="input"
                      value={draft}
                      onChange={e => setDrafts(d => ({ ...d, [r.key]: e.target.value }))}
                    >
                      {hint.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      inputMode={hint.type === 'number' ? 'decimal' : 'text'}
                      className="input"
                      value={draft}
                      onChange={e => setDrafts(d => ({ ...d, [r.key]: e.target.value }))}
                    />
                  )}
                  <button
                    onClick={() => saveAppConfig(r.key, draft)}
                    disabled={!dirty || busy}
                    className="btn-primary px-3 py-2"
                  >
                    <Save size={13} />
                  </button>
                </div>
              </div>
            )
          })}
          {currentSource === 'config' && (
            <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-xl border border-admin/40 bg-admin-soft text-admin text-[12px]">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>Pricing source is set to <b>config</b>. Pricing/payout reads from the tables below.</span>
            </div>
          )}
        </section>

        {/* pricing_config */}
        <section className="card flex flex-col gap-2">
          <h2 className="font-semibold text-ink">Pricing per category</h2>
          <p className="text-[12.5px] text-ink-muted">Active only when pricing_source = config.</p>
          <table className="w-full text-sm mt-2">
            <thead className="text-ink-subtle">
              <tr className="text-[11px] uppercase tracking-wider">
                <th className="text-start py-1.5">Category</th>
                <th className="text-end py-1.5">Consumer ₪</th>
                <th className="text-end py-1.5">Washer ₪</th>
                <th className="text-end py-1.5">Platform ₪</th>
              </tr>
            </thead>
            <tbody>
              {pricing.map(p => (
                <tr key={p.category} className="border-t border-edge font-mono">
                  <td className="py-1.5">{p.category}</td>
                  <td className="py-1.5 text-end tabular-nums">{p.consumer_price}</td>
                  <td className="py-1.5 text-end tabular-nums">{p.worker_price}</td>
                  <td className="py-1.5 text-end tabular-nums">{p.platform_fee}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-ink-subtle mt-1">Inline pricing edits are intentionally not exposed yet — set via SQL or extend this surface after the source flip.</p>
        </section>

        {/* payout_tier_config */}
        <section className="card flex flex-col gap-2">
          <h2 className="font-semibold text-ink">Payout per tier</h2>
          <p className="text-[12.5px] text-ink-muted">Active only when pricing_source = config.</p>
          <table className="w-full text-sm mt-2">
            <thead className="text-ink-subtle">
              <tr className="text-[11px] uppercase tracking-wider">
                <th className="text-start py-1.5">Tier</th>
                <th className="text-end py-1.5">Payout ₪</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map(p => (
                <tr key={p.tier} className="border-t border-edge font-mono">
                  <td className="py-1.5">{p.tier}</td>
                  <td className="py-1.5 text-end tabular-nums">{p.payout}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
