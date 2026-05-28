import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Megaphone, Send, Users, AlertCircle, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

const SEGMENTS = [
  { id: 'all_consumers', label: 'All consumers' },
  { id: 'all_washers',   label: 'All washers'   },
  { id: 'all_agents',    label: 'All agents'    },
  { id: 'single_user',   label: 'Single user'   },
  { id: 'segment',       label: 'Filtered segment' },
]

function emptyDraft() {
  return {
    title_en: '', title_he: '',
    body_en: '',  body_he: '',
    deep_link_route: '',
    segment_type: 'all_consumers',
    segment_payload: {},
    scheduled_at: '',
  }
}

export default function Broadcasts() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [draft, setDraft] = useState(emptyDraft)
  const [confirming, setConfirming] = useState(null) // { broadcast_id, count }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [history, setHistory] = useState([])
  const [previewCount, setPreviewCount] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  async function loadHistory() {
    const { data } = await supabase
      .from('broadcast_notifications')
      .select('id, title_en, segment_type, sent_at, scheduled_at, sent_count, failed_count, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    setHistory(data ?? [])
  }

  useEffect(() => { loadHistory() }, [])

  // Realtime — show new rows + status changes immediately
  useEffect(() => {
    const ch = supabase
      .channel('broadcasts-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcast_notifications' }, loadHistory)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  function patchSegmentPayload(patch) {
    setDraft(d => ({ ...d, segment_payload: { ...d.segment_payload, ...patch } }))
  }

  function changeSegmentType(segment_type) {
    setDraft(d => ({ ...d, segment_type, segment_payload: {} }))
    setPreviewCount(null)
  }

  function valid() {
    const required = ['title_en', 'title_he', 'body_en', 'body_he']
    if (required.some(k => !draft[k].trim())) return false
    if (draft.segment_type === 'single_user' && !draft.segment_payload.user_id) return false
    return true
  }

  async function previewTarget() {
    setPreviewBusy(true); setError(null)
    // Dry-run insert: create a draft row, count its segment, then DELETE.
    // We tag it with a marker title we never use otherwise so it does not
    // pollute history if the cleanup delete fails.
    const dryTitle = `__PREVIEW__ ${Date.now()}`
    const { data: row, error: insErr } = await supabase
      .from('broadcast_notifications')
      .insert({
        title_en: dryTitle, title_he: dryTitle,
        body_en: '_', body_he: '_',
        segment_type: draft.segment_type,
        segment_payload: draft.segment_payload,
        created_by: profile?.id,
      })
      .select('id')
      .single()
    if (insErr) { setError(insErr.message); setPreviewBusy(false); return null }
    const { data: ids, error: rpcErr } = await supabase
      .rpc('resolve_broadcast_segment', { p_broadcast_id: row.id })
    await supabase.from('broadcast_notifications').delete().eq('id', row.id)
    setPreviewBusy(false)
    if (rpcErr) { setError(rpcErr.message); return null }
    const count = ids?.length ?? 0
    setPreviewCount(count)
    return count
  }

  async function handleSendClick() {
    if (!valid()) return
    const count = await previewTarget()
    if (count == null) return
    // Stage 1 of 2: open the confirm interstitial. The actual send happens
    // on confirm so the user has to consciously approve hitting N users.
    setConfirming({ count })
  }

  async function handleConfirmSend() {
    setBusy(true); setError(null); setSuccess(null)
    // Insert the real broadcast row.
    const { data: row, error: insErr } = await supabase
      .from('broadcast_notifications')
      .insert({
        title_en: draft.title_en, title_he: draft.title_he,
        body_en:  draft.body_en,  body_he:  draft.body_he,
        deep_link_route: draft.deep_link_route || null,
        segment_type: draft.segment_type,
        segment_payload: draft.segment_payload,
        scheduled_at: draft.scheduled_at || null,
        created_by: profile?.id,
      })
      .select('id')
      .single()
    if (insErr) { setError(insErr.message); setBusy(false); return }

    if (draft.scheduled_at) {
      // Scheduling is stored; execution is deferred until pg_cron is wired.
      // The row will fire when send-broadcast is invoked by the future cron.
      setBusy(false); setConfirming(null)
      setSuccess(`Scheduled for ${new Date(draft.scheduled_at).toLocaleString()} (execution requires pg_cron — see DECISIONS.md).`)
      setDraft(emptyDraft())
      loadHistory()
      return
    }

    // Trigger send immediately via the server-side RPC.
    const { error: trigErr } = await supabase.rpc('trigger_broadcast', { p_broadcast_id: row.id })
    setBusy(false); setConfirming(null)
    if (trigErr) { setError(`Inserted but failed to trigger: ${trigErr.message}`); return }
    setSuccess(`Broadcast sent to ${confirming.count} user${confirming.count === 1 ? '' : 's'}.`)
    setDraft(emptyDraft())
    setPreviewCount(null)
    loadHistory()
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-edge bg-surface-elevated px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Megaphone size={18} className="text-admin" />
          <h1 className="text-lg font-bold tracking-tight">{t('dashboard.tabs.broadcasts')}</h1>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto w-full flex flex-col gap-6">
        {/* Compose */}
        <section className="card flex flex-col gap-4">
          <h2 className="font-semibold text-ink">Compose broadcast</h2>

          <BilingualField
            label="Title"
            valueEn={draft.title_en} valueHe={draft.title_he}
            onChange={(en, he) => setDraft(d => ({ ...d, title_en: en, title_he: he }))}
          />
          <BilingualField
            label="Body"
            multiline
            valueEn={draft.body_en} valueHe={draft.body_he}
            onChange={(en, he) => setDraft(d => ({ ...d, body_en: en, body_he: he }))}
          />

          <div className="flex flex-col gap-1">
            <label className="label-uppercase">Deep link route (optional)</label>
            <input
              className="input"
              placeholder="/home   ·   /order/abc-…   ·   /washer/earnings"
              value={draft.deep_link_route}
              onChange={e => setDraft(d => ({ ...d, deep_link_route: e.target.value }))}
            />
          </div>

          {/* Segment */}
          <div className="flex flex-col gap-2">
            <label className="label-uppercase">Target</label>
            <div className="flex flex-wrap gap-1.5">
              {SEGMENTS.map(s => (
                <button
                  key={s.id}
                  onClick={() => changeSegmentType(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${
                    draft.segment_type === s.id
                      ? 'bg-admin-soft border-admin text-admin'
                      : 'border-edge text-ink-muted hover:text-ink'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <SegmentInputs draft={draft} patch={patchSegmentPayload} />
          </div>

          {/* Schedule */}
          <div className="flex flex-col gap-1">
            <label className="label-uppercase">Schedule (optional)</label>
            <input
              type="datetime-local"
              className="input"
              value={draft.scheduled_at}
              onChange={e => setDraft(d => ({ ...d, scheduled_at: e.target.value }))}
            />
            {draft.scheduled_at && (
              <p className="text-[11px] text-warning flex items-center gap-1.5">
                <Clock size={11} />
                Scheduled broadcasts wait for pg_cron — see DECISIONS.md for setup status.
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /><span className="font-mono">{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-success/30 bg-success/10 text-success text-xs">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5" /><span>{success}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={previewTarget}
              disabled={previewBusy}
              className="btn-ghost text-sm flex items-center gap-2"
            >
              <Users size={14} />
              {previewBusy ? t('common.loading') : `Preview targets${previewCount != null ? ` (${previewCount})` : ''}`}
            </button>
            <div className="flex-1" />
            <button
              onClick={handleSendClick}
              disabled={!valid() || busy}
              className="btn-primary flex items-center gap-2"
            >
              <Send size={14} />
              {draft.scheduled_at ? 'Schedule' : 'Send now'}
            </button>
          </div>
        </section>

        {/* History */}
        <section className="card flex flex-col gap-3">
          <h2 className="font-semibold text-ink flex items-center justify-between">
            <span>History</span>
            <span className="text-[11px] text-ink-muted tabular-nums">{history.length}</span>
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-ink-muted">No broadcasts yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-edge">
              {history.map(h => (
                <div key={h.id} className="py-2.5 flex items-center gap-3 text-sm">
                  <span className="flex-1 truncate font-medium text-ink">{h.title_en}</span>
                  <span className="text-[11px] text-ink-muted px-2 py-0.5 rounded bg-surface">{h.segment_type}</span>
                  {h.sent_at ? (
                    <span className="text-[11px] text-success font-mono tabular-nums">
                      {h.sent_count}↑ / {h.failed_count}↓
                    </span>
                  ) : h.scheduled_at ? (
                    <span className="text-[11px] text-warning flex items-center gap-1">
                      <Clock size={10} /> {new Date(h.scheduled_at).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-subtle">draft</span>
                  )}
                  <span className="text-[10px] text-ink-subtle whitespace-nowrap">
                    {new Date(h.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Confirm interstitial */}
      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => !busy && setConfirming(null)}>
          <div
            className="w-full max-w-md card flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle size={22} className="text-warning shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-base font-bold text-ink mb-1">
                  Confirm broadcast to {confirming.count} user{confirming.count === 1 ? '' : 's'}
                </h3>
                <p className="text-[12.5px] text-ink-muted">
                  This will fire a push notification to every targeted user (respecting their promos opt-in).
                  This action is not undoable.
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-edge p-3 bg-surface">
              <p className="text-[11px] text-ink-subtle uppercase tracking-wider font-semibold mb-1">Preview · EN</p>
              <p className="text-sm font-semibold text-ink">{draft.title_en}</p>
              <p className="text-[13px] text-ink-muted whitespace-pre-wrap mt-0.5">{draft.body_en}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirming(null)} disabled={busy} className="btn-ghost">
                {t('common.cancel')}
              </button>
              <button onClick={handleConfirmSend} disabled={busy} className="btn-primary">
                {busy ? t('common.loading') : `Send to ${confirming.count}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BilingualField({ label, multiline, valueEn, valueHe, onChange }) {
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <div className="flex flex-col gap-2">
      <label className="label-uppercase">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        <Tag
          dir="ltr"
          className="input min-h-[44px]"
          rows={multiline ? 3 : undefined}
          placeholder={`${label} (EN)`}
          value={valueEn}
          onChange={e => onChange(e.target.value, valueHe)}
        />
        <Tag
          dir="rtl"
          className="input min-h-[44px]"
          rows={multiline ? 3 : undefined}
          placeholder={`${label} (HE)`}
          value={valueHe}
          onChange={e => onChange(valueEn, e.target.value)}
        />
      </div>
    </div>
  )
}

function SegmentInputs({ draft, patch }) {
  if (draft.segment_type === 'single_user') {
    return (
      <input
        className="input"
        placeholder="user UUID"
        value={draft.segment_payload.user_id ?? ''}
        onChange={e => patch({ user_id: e.target.value })}
      />
    )
  }
  if (draft.segment_type === 'segment') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <select
          className="input"
          value={draft.segment_payload.role ?? ''}
          onChange={e => patch({ role: e.target.value || undefined })}
        >
          <option value="">any role</option>
          <option value="consumer">consumer</option>
          <option value="washer">washer</option>
          <option value="agent">agent</option>
        </select>
        <input
          type="number" min={1} max={5}
          className="input"
          placeholder="tier ≥"
          value={draft.segment_payload.tier_min ?? ''}
          onChange={e => patch({ tier_min: e.target.value })}
        />
        <input
          type="number" min={1}
          className="input"
          placeholder="ordered within (days)"
          value={draft.segment_payload.ordered_within_days ?? ''}
          onChange={e => patch({ ordered_within_days: e.target.value })}
        />
        <input
          type="number" min={1}
          className="input"
          placeholder="new within (days)"
          value={draft.segment_payload.new_within_days ?? ''}
          onChange={e => patch({ new_within_days: e.target.value })}
        />
      </div>
    )
  }
  return null
}
