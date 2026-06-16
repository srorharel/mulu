import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  History as HistoryIcon, AlertCircle, AlertTriangle, RotateCcw,
  ChevronDown, ChevronRight, Undo2, LifeBuoy, CheckCircle2,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { relativeTime } from '../lib/relativeTime.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import PageHeader from '../components/PageHeader.jsx'
import {
  HISTORY_FILTERS, PAGE_SIZE,
  fetchActivityFeed, undoChange, fetchDeletionSnapshot, restoreUser,
  actionLabel, extractDisplayValue, categoryColor,
  isUndoable, isUserDeletion, isNotReversible,
} from '../lib/adminHistory.js'

const RESTORE_WARNING =
  "Best-effort only. The user's login may need to be recreated with a new ID. " +
  'Orders, ratings, tokens, and chat history from before deletion may NOT reconnect. ' +
  'Review the restore report carefully.'

export default function History() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('all')
  const [entries, setEntries] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())
  const [toast, setToast] = useState(null)         // { kind:'ok'|'err', text }

  const [confirmUndo, setConfirmUndo] = useState(null)   // entry
  const [undoBusy, setUndoBusy] = useState(false)

  const [restore, setRestore] = useState(null)     // { entry, snapshot, email, busy, report }

  const filterRef = useRef(filter)
  filterRef.current = filter

  const load = useCallback(async ({ append = false } = {}) => {
    setBusy(true); setError(null)
    try {
      const before = append && entries.length ? entries[entries.length - 1].occurred_at : null
      const rows = await fetchActivityFeed({ limit: PAGE_SIZE, before, entityType: filterRef.current })
      setHasMore(rows.length === PAGE_SIZE)
      setEntries(prev => (append ? [...prev, ...rows] : rows))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [entries])

  // Reload from scratch whenever the filter changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load({ append: false }) }, [filter])

  // Live: a new override edit lands → refetch the first page (respecting filter).
  useEffect(() => {
    const ch = supabase
      .channel('admin-change-history-feed')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_change_history' },
        () => load({ append: false })
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(id)
  }, [toast])

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Undo ────────────────────────────────────────────────────────────────
  async function doUndo() {
    if (!confirmUndo) return
    setUndoBusy(true)
    try {
      await undoChange(confirmUndo.ref_id)
      setToast({ kind: 'ok', text: `Reverted: ${actionLabel(confirmUndo)}` })
      setConfirmUndo(null)
      await load({ append: false })
    } catch (e) {
      const conflict = /conflict/i.test(e.message)
      setConfirmUndo(null)
      // Surface a conflict clearly + expand the entry so the admin can compare
      // what this entry would restore against the (newer) live value.
      if (conflict) setExpanded(prev => new Set(prev).add(confirmUndo.ref_id))
      setToast({
        kind: 'err',
        text: conflict
          ? 'This has been edited since, so undo is blocked to avoid clobbering a newer change. Expanded below; review the live value before retrying.'
          : `Undo failed: ${e.message}`,
      })
    } finally {
      setUndoBusy(false)
    }
  }

  // ── Restore (best-effort) ─────────────────────────────────────────────────
  async function openRestore(entry) {
    setRestore({ entry, snapshot: null, email: '', busy: true, report: null, error: null })
    try {
      const snap = await fetchDeletionSnapshot(entry.ref_id)
      setRestore(r => r && { ...r, snapshot: snap, email: snap?.auth_email ?? '', busy: false })
    } catch (e) {
      setRestore(r => r && { ...r, busy: false, error: e.message })
    }
  }

  async function doRestore() {
    if (!restore) return
    setRestore(r => ({ ...r, busy: true, error: null }))
    try {
      const report = await restoreUser({ auditId: restore.entry.ref_id, email: restore.email.trim() })
      setRestore(r => ({ ...r, busy: false, report }))
      await load({ append: false })
    } catch (e) {
      setRestore(r => ({ ...r, busy: false, error: e.message }))
    }
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        icon={HistoryIcon}
        title={t('dashboard.tabs.history')}
        right={<span className="text-[11px] text-ink-muted tabular-nums">{entries.length} shown</span>}
      >
        {/* Filter pills — horizontal scroll on mobile (matches the responsive pass). */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {HISTORY_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 px-3 py-1.5 text-[12px] font-semibold rounded-full border transition-colors ${
                filter === f.id
                  ? 'bg-admin-soft text-admin-deep border-admin/40'
                  : 'bg-surface text-ink-muted border-edge hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span className="font-mono break-all">{error}</span>
          </div>
        )}
        {toast && (
          <div className={`mt-3 flex items-start gap-2 px-3 py-2 rounded-xl border text-xs ${
            toast.kind === 'ok'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-warning/40 bg-warning/10 text-warning'
          }`}>
            {toast.kind === 'ok' ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
            <span>{toast.text}</span>
          </div>
        )}
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-2">
          {entries.map(e => (
            <HistoryCard
              key={`${e.source_table}:${e.ref_id}`}
              entry={e}
              expanded={expanded.has(e.ref_id)}
              onToggle={() => toggleExpand(e.ref_id)}
              onUndo={() => setConfirmUndo(e)}
              onRestore={() => openRestore(e)}
            />
          ))}

          {entries.length === 0 && (
            <p className="px-3 py-16 text-center text-ink-subtle text-sm">
              {busy ? t('common.loading') : 'No activity recorded for this filter yet.'}
            </p>
          )}

          {hasMore && (
            <button
              onClick={() => load({ append: true })}
              disabled={busy}
              className="btn-ghost self-center mt-2 text-[13px]"
            >
              {busy ? t('common.loading') : 'Load older'}
            </button>
          )}
        </div>
      </div>

      {/* Undo confirm */}
      <ConfirmDialog
        open={!!confirmUndo}
        title="Undo this change?"
        message={confirmUndo
          ? `Restores the previous value of "${confirmUndo.entity_label}". This undo is itself recorded in history (and can be undone). Blocked if the value has changed since.`
          : ''}
        confirmLabel="Undo"
        cancelLabel="Cancel"
        destructive
        busy={undoBusy}
        onCancel={() => setConfirmUndo(null)}
        onConfirm={doUndo}
      />

      {/* Best-effort restore */}
      <RestoreDialog
        restore={restore}
        onClose={() => setRestore(null)}
        onChangeEmail={(email) => setRestore(r => r && { ...r, email })}
        onConfirm={doRestore}
      />
    </div>
  )
}

// ── Feed card ────────────────────────────────────────────────────────────────
function HistoryCard({ entry, expanded, onToggle, onUndo, onRestore }) {
  const undoable = isUndoable(entry)
  const restorable = isUserDeletion(entry)
  const notReversible = isNotReversible(entry)

  const isOverride = entry.source_table === 'admin_change_history'
  const beforeVal = isOverride ? extractDisplayValue(entry.entity_type, entry.before_value) : null
  const afterVal  = isOverride ? extractDisplayValue(entry.entity_type, entry.after_value)  : null
  const hasDiff   = isOverride && (beforeVal != null || afterVal != null)
  const hasPayload = !isOverride && (entry.before_value || entry.after_value)

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${categoryColor(entry.category)}`}>
          {entry.category}
        </span>
        <span className="text-[13px] font-semibold text-ink">{actionLabel(entry)}</span>
        <span className="ms-auto text-[11px] text-ink-subtle whitespace-nowrap">
          {entry.actor_name || 'system'} · {relativeTime(entry.occurred_at)}
        </span>
      </div>

      <p className="text-[12.5px] text-ink-muted break-all font-mono">{entry.entity_label}</p>
      {entry.reason && <p className="text-[12px] text-ink-subtle break-words">{entry.reason}</p>}

      {/* Override before → after diff, collapsed by default */}
      {hasDiff && (
        <div>
          <button onClick={onToggle} className="flex items-center gap-1 text-[11px] font-semibold text-ink-muted hover:text-ink">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Before → after
          </button>
          {expanded && (
            <div className="mt-1.5 flex flex-col gap-1.5 text-[12.5px]">
              <ValueBlock label="Before" value={beforeVal} tone="muted" />
              <ValueBlock label="After"  value={afterVal}  tone="ink" />
            </div>
          )}
        </div>
      )}

      {/* Non-override snapshot/payload, collapsed */}
      {hasPayload && (
        <div>
          <button onClick={onToggle} className="flex items-center gap-1 text-[11px] font-semibold text-ink-muted hover:text-ink">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Details
          </button>
          {expanded && (
            <pre className="mt-1.5 text-[10.5px] text-ink-subtle bg-surface rounded-lg px-2 py-1.5 overflow-x-auto max-h-64">
              {JSON.stringify(entry.after_value ?? entry.before_value, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-0.5">
        {undoable && (
          <button onClick={onUndo} className="btn-ghost text-[12px] flex items-center gap-1.5 text-admin-deep hover:bg-admin-soft">
            <Undo2 size={13} /> Undo
          </button>
        )}
        {restorable && (
          <button onClick={onRestore} className="btn-ghost text-[12px] flex items-center gap-1.5 text-danger hover:bg-danger/10">
            <LifeBuoy size={13} /> Restore (best-effort)
          </button>
        )}
        {notReversible && (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-subtle italic">
            <RotateCcw size={12} className="opacity-50" /> Not reversible
          </span>
        )}
      </div>
    </div>
  )
}

function ValueBlock({ label, value, tone }) {
  return (
    <div>
      <p className="label-uppercase mb-0.5">{label}</p>
      <p className={`whitespace-pre-wrap break-words rounded-lg px-2 py-1.5 border border-edge bg-surface ${tone === 'muted' ? 'text-ink-subtle' : 'text-ink font-medium'}`}>
        {value == null || value === '' ? '—' : value}
      </p>
    </div>
  )
}

// ── Restore dialog (the fragile one) ──────────────────────────────────────────
function RestoreDialog({ restore, onClose, onChangeEmail, onConfirm }) {
  if (!restore) return null
  const { entry, snapshot, email, busy, report, error } = restore
  const alreadyRestored = snapshot?.already_restored
  const knownEmail = snapshot?.auth_email
  const emailOk = email.trim().length > 3 && email.includes('@')

  return (
    <ConfirmDialog
      open
      title={report ? 'Restore report' : 'Restore user (best-effort)'}
      message={report ? '' : RESTORE_WARNING}
      confirmLabel={report ? 'Done' : 'Restore user'}
      cancelLabel={report ? 'Close' : 'Cancel'}
      destructive={!report}
      busy={busy}
      confirmDisabled={!report && (!emailOk || alreadyRestored)}
      onCancel={onClose}
      onConfirm={report ? onClose : onConfirm}
    >
      {!report && (
        <div className="flex flex-col gap-2">
          {alreadyRestored && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-warning/40 bg-warning/10 text-warning text-[12px]">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>This deletion already has a restore on record. Restoring again will create another account.</span>
            </div>
          )}
          <p className="text-[12px] text-ink-muted">
            Deleting record: <span className="font-mono text-ink">{entry.entity_label}</span>
          </p>
          <label className="label-uppercase">
            Type the user&apos;s email to confirm{knownEmail ? ` (${knownEmail})` : ' (not captured, supply it)'}
          </label>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => onChangeEmail(e.target.value)}
            placeholder="user@example.com"
            className="input"
          />
          {error && <p className="text-[11.5px] text-danger font-mono break-all">{error}</p>}
        </div>
      )}

      {report && (
        <div className="flex flex-col gap-2 text-[12px]">
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-success/30 bg-success/10 text-success">
            <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
            <span>
              Auth user recreated{report.restored?.id_reused ? ' (original id reused)' : ' with a NEW id'}.
              Profile {report.restored?.profile ? 'restored' : 'NOT restored'}.
            </span>
          </div>
          <p className="text-ink-muted">Email: <span className="font-mono text-ink">{report.restored?.email}</span></p>
          {report.restored?.temporary_password && (
            <p className="text-ink-muted break-all">
              Temp password: <span className="font-mono text-ink">{report.restored.temporary_password}</span>
            </p>
          )}
          <div>
            <p className="label-uppercase mb-0.5">Not reconnected</p>
            <p className="text-ink-subtle break-words">{(report.not_reconnected ?? []).join(', ') || '—'}</p>
          </div>
          {(report.warnings ?? []).map((w, i) => (
            <p key={i} className="text-warning text-[11.5px]">⚠ {w}</p>
          ))}
        </div>
      )}
    </ConfirmDialog>
  )
}
