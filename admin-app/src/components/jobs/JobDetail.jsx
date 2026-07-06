import { useEffect, useState } from 'react'
import { X, AlertCircle, AlertTriangle, CheckCircle2, UserCog, Wallet, Camera, Ban, ArrowLeftRight, MessageSquare, History } from 'lucide-react'
import {
  fetchJobDetail, fetchProfileBrief, fetchOrderEvents, fetchOrderMessages,
  fetchAvailableWashers, signedUrlFor, uploadReplacement, logPhotoReplacement,
  adminReassignWasher, adminOverridePrice, forceOrderStage,
  statusColor, PHOTO_FIELDS, bucketForField,
  FORCE_STAGES, forceStageWarnings, isBackwardForce,
} from '../../lib/adminJobs.js'
import { supabase } from '../../lib/supabase.js'
import AdminAuditTimeline from './AdminAuditTimeline.jsx'
import ConfirmDialog from '../ConfirmDialog.jsx'

// Slide-in panel. Fixed-position overlay, light theme, scrollable body.
// Read panel + action buttons + audit timeline. Each write goes through a
// small dedicated sub-form (reassign, price, cancel/complete, photo replace).

export default function JobDetail({ orderId, onClose, onChanged }) {
  const [order, setOrder]       = useState(null)
  const [consumer, setConsumer] = useState(null)
  const [washer, setWasher]     = useState(null)
  const [events, setEvents]     = useState([])
  const [messages, setMessages] = useState([])
  const [error, setError]       = useState(null)
  const [busy, setBusy]         = useState(false)
  const [section, setSection]   = useState(null)  // 'reassign' | 'price' | 'cancel' | 'complete' | null

  async function load() {
    setError(null)
    try {
      const o = await fetchJobDetail(orderId)
      setOrder(o)
      const [c, w, ev, ms] = await Promise.all([
        fetchProfileBrief(o.consumer_id),
        o.washer_id ? fetchProfileBrief(o.washer_id) : null,
        fetchOrderEvents(orderId),
        fetchOrderMessages(orderId),
      ])
      setConsumer(c)
      setWasher(w)
      setEvents(ev)
      setMessages(ms)
    } catch (e) { setError(e.message) }
  }

  useEffect(() => { load() }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime — order updates while panel is open.
  useEffect(() => {
    const ch = supabase
      .channel(`job-detail-${orderId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        load
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function doTransition(status, reason) {
    setBusy(true); setError(null)
    try {
      // Route through admin_force_order_stage so the typed reason actually
      // lands in the audit row — a bare transition_order_status call writes
      // reason = NULL and silently discards what the admin typed.
      await forceOrderStage(orderId, status, reason)
      await load()
      onChanged?.()
      setSection(null)
    } catch (e) { setError(e.message) }
    finally    { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" onClick={onClose}>
      <aside
        className="w-full max-w-2xl h-full bg-surface shadow-2xl border-l border-edge overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 bg-surface-elevated border-b border-edge px-5 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-ink-subtle">Order detail</p>
            <p className="font-mono text-[13px] text-ink truncate">{orderId}</p>
          </div>
          {order && (
            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${statusColor(order.status)}`}>
              {order.status}
            </span>
          )}
          <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink h-10 w-10 -me-1 flex items-center justify-center rounded-xl hover:bg-surface-elevated-2">
            <X size={18} />
          </button>
        </header>

        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /><span className="font-mono">{error}</span>
          </div>
        )}
        {!order && !error && (
          <div className="p-8 text-center text-ink-muted text-sm">Loading…</div>
        )}

        {order && (
          <div className="p-4 sm:p-5 flex flex-col gap-5">

            <SummaryGrid order={order} consumer={consumer} washer={washer} />

            {/* Action buttons */}
            <div className="card grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
              <ActionBtn onClick={() => setSection('reassign')} icon={UserCog} label="Reassign washer" />
              <ActionBtn onClick={() => setSection('price')}     icon={Wallet}  label="Override price" />
              <ActionBtn onClick={() => setSection('cancel')}    icon={Ban}     label="Cancel" danger
                disabled={['completed','cancelled'].includes(order.status)} />
              <ActionBtn onClick={() => setSection('complete')}  icon={CheckCircle2} label="Force complete"
                disabled={['completed','cancelled'].includes(order.status)} />
              <ActionBtn onClick={() => setSection('force_stage')} icon={ArrowLeftRight} label="Force stage" />
            </div>

            {/* Sub-sections */}
            {section === 'reassign' && (
              <ReassignSection orderId={orderId} currentWasherId={order.washer_id}
                onDone={() => { setSection(null); load(); onChanged?.() }}
                onCancel={() => setSection(null)} />
            )}
            {section === 'price' && (
              <PriceSection order={order}
                onDone={() => { setSection(null); load(); onChanged?.() }}
                onCancel={() => setSection(null)} />
            )}
            {section === 'cancel' && (
              <ConfirmReason
                title="Cancel order (admin override)"
                hint="Cancels regardless of status. Reason required (audit log)."
                confirmLabel="Cancel order"
                busy={busy}
                destructive
                onConfirm={async (reason) => { await doTransition('cancelled', reason) }}
                onCancel={() => setSection(null)}
              />
            )}
            {section === 'complete' && (
              <ConfirmReason
                title="Force complete (admin override)"
                hint="Skips photo/GPS validation and marks the order complete. Reason required (audit log)."
                confirmLabel="Force complete"
                busy={busy}
                onConfirm={async (reason) => { await doTransition('completed', reason) }}
                onCancel={() => setSection(null)}
              />
            )}
            {section === 'force_stage' && (
              <ForceStageSection
                order={order}
                onDone={() => { setSection(null); load(); onChanged?.() }}
                onCancel={() => setSection(null)}
              />
            )}

            <PhotosSection order={order} onChanged={load} />

            {/* Standard order_events timeline */}
            <section className="card">
              <h3 className="font-semibold text-ink mb-2 flex items-center gap-2"><History size={14} /> Order events</h3>
              {events.length === 0 ? (
                <p className="text-sm text-ink-muted">No events yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-edge text-[12px]">
                  {events.map(e => (
                    <div key={e.id} className="py-1.5 flex items-center gap-2">
                      <span className="text-ink-muted tabular-nums">{new Date(e.created_at).toLocaleString()}</span>
                      <span className="text-ink-subtle">·</span>
                      <span className="text-ink">{e.from_status ?? '∅'} → {e.to_status}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <AdminAuditTimeline orderId={orderId} />

            <section className="card">
              <h3 className="font-semibold text-ink mb-2 flex items-center gap-2"><MessageSquare size={14} /> Order chat ({messages.length})</h3>
              {messages.length === 0 ? (
                <p className="text-sm text-ink-muted">No messages.</p>
              ) : (
                <div className="flex flex-col gap-1.5 text-[12.5px] max-h-[320px] overflow-y-auto">
                  {messages.map(m => (
                    <div key={m.id} className="rounded-xl border border-edge px-3 py-1.5 bg-surface">
                      <p className="text-[10.5px] text-ink-subtle uppercase tracking-wider mb-0.5">
                        {m.sender_role} · {new Date(m.created_at).toLocaleString()}
                      </p>
                      <p className="text-ink whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
        )}
      </aside>
    </div>
  )
}

function ActionBtn({ icon: Icon, label, danger, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? 'btn border border-danger/50 text-danger hover:bg-danger/10 disabled:opacity-50 text-sm w-full sm:w-auto'
          : 'btn border border-edge text-ink hover:bg-surface-elevated-2 disabled:opacity-50 text-sm w-full sm:w-auto'
      }
    >
      <Icon size={14} /> {label}
    </button>
  )
}

function SummaryGrid({ order, consumer, washer }) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <PartyCard title="Consumer" profile={consumer} />
      <PartyCard title="Washer" profile={washer} emptyHint="Unassigned" />
      <InfoCard title="Vehicle">
        <p className="font-mono text-sm text-ink">{order.car_plate || '—'}</p>
        <p className="text-[12px] text-ink-muted">{[order.car_make, order.car_model, order.car_color, order.car_year].filter(Boolean).join(' · ') || '—'}</p>
        <p className="text-[11px] text-ink-subtle">{order.car_type}</p>
      </InfoCard>
      <InfoCard title="Pricing">
        <p className="tabular-nums text-sm text-ink">Consumer ₪{Number(order.total_price ?? 0)}</p>
        <p className="tabular-nums text-[12px] text-ink-muted">Payout ₪{Number(order.payout_amount ?? order.base_price ?? 0)}</p>
        <p className="tabular-nums text-[11px] text-ink-subtle">Platform fee ₪{Number(order.platform_fee ?? 0)}</p>
      </InfoCard>
      <InfoCard title="Site">
        <p className="text-[12px] text-ink-muted">Water: {order.site_has_water ? 'yes' : 'no'} · Power: {order.site_has_power ? 'yes' : 'no'}</p>
        {order.access_notes && <p className="text-[11px] text-ink-subtle mt-1 whitespace-pre-wrap">{order.access_notes}</p>}
      </InfoCard>
      <InfoCard title="Approval state">
        <p className="text-[12px] text-ink-muted">declines: <span className="tabular-nums">{order.decline_count ?? 0}</span></p>
        {order.decline_reason && <p className="text-[11px] text-ink-subtle mt-1">last: {order.decline_reason}</p>}
        {order.submitted_lat && order.submitted_lng && (
          <p className="text-[10.5px] text-ink-subtle mt-1 font-mono">submitted @ {order.submitted_lat.toFixed(5)}, {order.submitted_lng.toFixed(5)}</p>
        )}
      </InfoCard>
    </section>
  )
}

function PartyCard({ title, profile, emptyHint = '—' }) {
  return (
    <div className="card">
      <p className="text-[10.5px] uppercase tracking-wider text-ink-subtle mb-1">{title}</p>
      {profile ? (
        <>
          <p className="text-sm font-semibold text-ink truncate">{profile.full_name || '—'}</p>
          <p className="text-[12px] text-ink-muted">{profile.phone || '—'}</p>
          {profile.role === 'washer' && (
            <p className="text-[11px] text-ink-subtle mt-1">
              Tier {profile.current_tier ?? '—'} · ⭐ {profile.current_rating ?? '—'}
              {profile.washer_verification_status && ` · ${profile.washer_verification_status}`}
            </p>
          )}
          <p className="text-[10.5px] text-ink-subtle mt-0.5 font-mono truncate">{profile.id}</p>
        </>
      ) : (
        <p className="text-sm text-ink-subtle italic">{emptyHint}</p>
      )}
    </div>
  )
}

function InfoCard({ title, children }) {
  return (
    <div className="card">
      <p className="text-[10.5px] uppercase tracking-wider text-ink-subtle mb-1">{title}</p>
      {children}
    </div>
  )
}

function ReassignSection({ orderId, currentWasherId, onDone, onCancel }) {
  const [washers, setWashers] = useState([])
  const [pickedId, setPicked] = useState('')
  const [reason, setReason]   = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    fetchAvailableWashers().then(setWashers).catch(e => setError(e.message))
  }, [])

  async function doReassign() {
    setBusy(true); setError(null)
    try {
      await adminReassignWasher({ orderId, newWasherId: pickedId, reason })
      onDone?.()
    } catch (e) { setError(e.message) }
    finally    { setBusy(false) }
  }

  return (
    <section className="card flex flex-col gap-3">
      <h3 className="font-semibold text-ink flex items-center gap-2"><UserCog size={14} /> Reassign washer</h3>
      <select
        value={pickedId}
        onChange={e => setPicked(e.target.value)}
        className="input"
      >
        <option value="">— pick washer —</option>
        {washers.filter(w => w.id !== currentWasherId).map(w => (
          <option key={w.id} value={w.id}>
            {w.full_name} · tier {w.current_tier ?? '—'} {w.is_online ? '· online' : ''}
          </option>
        ))}
      </select>
      <textarea rows={2} className="input" placeholder="Reason (≥3 chars)" value={reason} onChange={e => setReason(e.target.value)} />
      <p className="text-[11px] text-ink-muted">
        Payout will be recomputed from the new washer&apos;s tier (ADR-026).
      </p>
      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={busy || !pickedId || reason.trim().length < 3} onClick={doReassign}>
          {busy ? 'Working…' : 'Reassign'}
        </button>
      </div>
    </section>
  )
}

function PriceSection({ order, onDone, onCancel }) {
  const [consumerPrice, setConsumer] = useState(String(order.total_price ?? ''))
  const [payout,        setPayout]   = useState(String(order.payout_amount ?? order.base_price ?? ''))
  const [reason,        setReason]   = useState('')
  const [busy,          setBusy]     = useState(false)
  const [error,         setError]    = useState(null)

  async function doSave() {
    setBusy(true); setError(null)
    try {
      await adminOverridePrice({
        orderId: order.id,
        newConsumerPrice: Number(consumerPrice),
        newPayout:        Number(payout),
        reason,
      })
      onDone?.()
    } catch (e) { setError(e.message) }
    finally    { setBusy(false) }
  }

  return (
    <section className="card flex flex-col gap-3">
      <h3 className="font-semibold text-ink flex items-center gap-2"><Wallet size={14} /> Override price</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="label-uppercase">Consumer pays (₪)</span>
          <input type="number" min={0} className="input" value={consumerPrice} onChange={e => setConsumer(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-uppercase">Washer payout (₪)</span>
          <input type="number" min={0} className="input" value={payout} onChange={e => setPayout(e.target.value)} />
        </label>
      </div>
      <textarea rows={2} className="input" placeholder="Reason (≥3 chars)" value={reason} onChange={e => setReason(e.target.value)} />
      <p className="text-[11px] text-ink-muted">
        Bypasses the validate_order_prices trigger. Platform fee = consumer − payout.
      </p>
      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={busy || reason.trim().length < 3} onClick={doSave}>
          {busy ? 'Working…' : 'Save'}
        </button>
      </div>
    </section>
  )
}

function ConfirmReason({ title, hint, confirmLabel, busy, destructive, onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  const [open, setOpen]     = useState(false)
  return (
    <section className="card flex flex-col gap-3">
      <h3 className="font-semibold text-ink">{title}</h3>
      {hint && <p className="text-[12px] text-ink-muted">{hint}</p>}
      <textarea rows={2} className="input" placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} />
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button
          className={destructive
            ? 'btn border border-danger/50 text-danger hover:bg-danger/10'
            : 'btn-primary'}
          onClick={() => setOpen(true)}
          disabled={busy || !reason.trim()}
        >
          {confirmLabel}
        </button>
      </div>
      <ConfirmDialog
        open={open}
        title={title}
        message={`Reason: ${reason}`}
        confirmLabel={confirmLabel}
        destructive={destructive}
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={async () => { await onConfirm?.(reason); setOpen(false) }}
      />
    </section>
  )
}

// Force stage — set the order to ANY status (forward, backward, skipping).
// Exported for unit testing in isolation from the data-loading JobDetail shell.
export function ForceStageSection({ order, onDone, onCancel }) {
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)
  const [open, setOpen]     = useState(false)

  const current  = order.status
  const warnings = target ? forceStageWarnings(current, target) : []
  const canApply = !!target && target !== current && reason.trim().length > 0

  async function doForce() {
    setBusy(true); setError(null)
    try {
      await forceOrderStage(order.id, target, reason)
      setOpen(false)
      onDone?.()
    } catch (e) {
      setError(e.message); setBusy(false); setOpen(false)
    }
  }

  return (
    <section className="card flex flex-col gap-3">
      <h3 className="font-semibold text-ink flex items-center gap-2"><ArrowLeftRight size={14} /> Force stage</h3>
      <p className="text-[12px] text-ink-muted">
        Set this order to any stage (forward, backward, or skipping) to match reality. Reason required; every change is audited.
      </p>

      {/* Stage picker — all 8 statuses, current one marked */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {FORCE_STAGES.map(s => {
          const isCurrent = s === current
          const selected  = s === target
          return (
            <button
              key={s}
              type="button"
              aria-pressed={selected}
              onClick={() => setTarget(s)}
              className={`px-2 py-1.5 rounded-xl border text-[11px] font-semibold uppercase tracking-wider text-center leading-tight transition ${
                selected
                  ? 'border-admin bg-admin-soft text-admin-deep'
                  : 'border-edge text-ink-muted hover:bg-surface-elevated-2'
              }`}
            >
              {s}
              {isCurrent && <span className="block text-[8.5px] font-normal lowercase tracking-normal text-ink-subtle">current</span>}
            </button>
          )
        })}
      </div>

      {/* Contextual side-effect warnings (informational — action still allowed) */}
      {warnings.map((w, i) => (
        <div
          key={i}
          role="alert"
          className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-[11.5px] leading-relaxed ${
            w.tone === 'warn'
              ? 'border-warning/40 bg-warning/10 text-warning'
              : 'border-edge bg-surface-elevated-2 text-ink-muted'
          }`}
        >
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>{w.text}</span>
        </div>
      ))}

      <textarea
        rows={2}
        className="input"
        placeholder="Reason (required)"
        value={reason}
        onChange={e => setReason(e.target.value)}
      />
      {error && <p className="text-xs text-danger font-mono">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={!canApply || busy} onClick={() => setOpen(true)}>
          {busy ? 'Working…' : 'Force stage'}
        </button>
      </div>

      <ConfirmDialog
        open={open}
        title={`Force stage → ${target}`}
        message={`Set status "${current}" → "${target}". Reason: ${reason.trim() || '(none)'}`}
        confirmLabel="Force stage"
        destructive={isBackwardForce(current, target)}
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={doForce}
      />
    </section>
  )
}

function PhotosSection({ order, onChanged }) {
  return (
    <section className="card flex flex-col gap-3">
      <h3 className="font-semibold text-ink flex items-center gap-2"><Camera size={14} /> Photos</h3>
      <PhotoGroup label="Consumer car (4)" fields={PHOTO_FIELDS.car} order={order} onChanged={onChanged} />
      <PhotoGroup label="Arrival (4)" fields={PHOTO_FIELDS.arrival} order={order} onChanged={onChanged} />
      <PhotoGroup label="Completion (4)" fields={PHOTO_FIELDS.completion} order={order} onChanged={onChanged} />
    </section>
  )
}

function PhotoGroup({ label, fields, order, onChanged }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider text-ink-subtle mb-1">{label}</p>
      <div className="grid grid-cols-4 gap-2">
        {fields.map(f => (
          <PhotoCell key={f} field={f} path={order[f]} orderId={order.id} onChanged={onChanged} />
        ))}
      </div>
    </div>
  )
}

function PhotoCell({ field, path, orderId, onChanged }) {
  const [url, setUrl]     = useState(null)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)
  // Replacements upsert to the SAME storage path, so `path` doesn't change —
  // bump this to force a fresh signed URL (new token → browser refetches).
  const [ver, setVer]     = useState(0)
  const bucket = bucketForField(field)
  const angle = field.replace(/^.*_(front|back|driver|passenger)$/, '$1')

  useEffect(() => {
    if (!path) { setUrl(null); return }
    signedUrlFor(bucket, path).then(setUrl)
  }, [bucket, path, ver])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null)
    try {
      const newPath = path ?? `${orderId}/${field}.jpg`
      await uploadReplacement({ bucket, path: newPath, file })
      await logPhotoReplacement({ orderId, field, newPath, reason: 'admin photo replacement' })
      setVer(v => v + 1)
      onChanged?.()
    } catch (err) { setError(err.message) }
    finally       { setBusy(false) }
  }

  return (
    <label className="block cursor-pointer group">
      <div className="aspect-square rounded-xl border border-edge bg-surface overflow-hidden flex items-center justify-center">
        {url ? (
          <img src={url} alt={field} className="w-full h-full object-cover group-hover:opacity-90" />
        ) : (
          <span className="text-[10px] text-ink-subtle">empty</span>
        )}
      </div>
      <p className="text-[9.5px] text-ink-subtle text-center mt-0.5 uppercase tracking-wider">{angle}</p>
      {error && <p className="text-[9.5px] text-danger truncate">{error}</p>}
      <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={busy} />
    </label>
  )
}
