import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReceiptText, Save, AlertCircle, Send, Info, Download, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { relativeTime } from '../lib/relativeTime.js'

// Receipt settings live in app_config (seeded by migration 0113) and are
// SNAPSHOTTED onto each receipt at issue time — edits here only affect
// receipts issued from now on, never historical ones.
export const RECEIPT_FIELDS = [
  { key: 'receipts_enabled',         label: 'Receipts enabled',
    hint: "Master switch. When 'false', completed orders issue no receipt at all.",
    options: ['true', 'false'] },
  { key: 'receipt_business_name',    label: 'Business name',
    hint: 'Shown in the email header and the business-details block.' },
  { key: 'receipt_dealer_number',    label: 'Authorized dealer no. (עוסק מורשה)',
    hint: 'Printed on every receipt next to the business name. Required for valid Israeli receipts.' },
  { key: 'receipt_business_address', label: 'Business address',
    hint: 'Optional line in the business-details block.' },
  { key: 'receipt_business_phone',   label: 'Business phone',
    hint: 'Optional line in the business-details block.' },
  { key: 'receipt_sender_email',     label: 'Sender email',
    hint: 'The From address receipts are sent from. The domain MUST be verified in Resend or every send fails.' },
  { key: 'receipt_sender_name',      label: 'Sender display name',
    hint: 'The From display name, e.g. "MULU".' },
  { key: 'receipt_footer_text',      label: 'Footer text',
    hint: 'Free-text line at the bottom of the receipt (refund policy, greeting…).' },
  { key: 'receipt_vat_rate_percent', label: 'VAT rate (%)',
    hint: 'Used to compute the pre-VAT/VAT split shown on the receipt. Prices are VAT-inclusive.',
    type: 'number' },
]

const STATUS_STYLES = {
  sent:    'bg-success/15 text-success',
  pending: 'bg-warning/15 text-warning',
  failed:  'bg-danger/15 text-danger',
}

// Receipts are low-volume (one per completed order), so a single generous cap is
// plenty whether the list is filtered by date or not.
const RECEIPTS_LIMIT = 500

export default function Receipts() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [rows, setRows]         = useState([])
  const [receipts, setReceipts] = useState([])
  const [drafts, setDrafts]     = useState({})
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)
  const [resending, setResending] = useState(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')

  async function loadConfig() {
    const keys = RECEIPT_FIELDS.map(f => f.key)
    const { data, error: err } = await supabase.from('app_config')
      .select('key, value, value_type, updated_at, editor:updated_by(full_name)')
      .in('key', keys).order('key')
    if (err) { setError(err.message); return }
    setRows(data ?? [])
  }

  // Receipts history, optionally constrained to an inclusive [fromDate, toDate]
  // calendar range. The <input type="date"> values are bare local dates, so we
  // convert each bound to a UTC instant at the admin's local day boundary —
  // a receipt issued on the chosen day shows up regardless of timezone offset.
  const loadReceipts = useCallback(async () => {
    setBusy(true)
    let query = supabase.from('receipts')
      .select('id, receipt_number, consumer_name, consumer_email, total, discount_amount, status, error_detail, sent_at, created_at, pdf_path')
      .order('receipt_number', { ascending: false })
    if (fromDate) query = query.gte('created_at', new Date(`${fromDate}T00:00:00`).toISOString())
    if (toDate)   query = query.lte('created_at', new Date(`${toDate}T23:59:59.999`).toISOString())
    const { data, error: err } = await query.limit(RECEIPTS_LIMIT)
    setBusy(false)
    if (err) { setError(err.message); return }
    setError(null)
    setReceipts(data ?? [])
  }, [fromDate, toDate])

  async function refresh() { await Promise.all([loadConfig(), loadReceipts()]) }

  useEffect(() => { loadConfig() }, [])
  useEffect(() => { loadReceipts() }, [loadReceipts])

  async function save(key, raw) {
    const field = RECEIPT_FIELDS.find(f => f.key === key)
    let value
    if (field?.type === 'number') {
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

  async function resend(id) {
    setResending(id)
    setError(null)
    const { error: err } = await supabase.rpc('admin_resend_receipt', { p_receipt_id: id })
    setResending(null)
    if (err) { setError(err.message); return }
    refresh()
  }

  // Archived PDFs (0114) live in the private 'receipts' bucket — download via
  // a short-lived signed URL (super_admin storage SELECT policy).
  async function downloadPdf(path) {
    setError(null)
    const { data, error: err } = await supabase.storage.from('receipts').createSignedUrl(path, 600)
    if (err) { setError(err.message); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-edge bg-surface-elevated px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <ReceiptText size={18} className="text-admin-deep" />
          <h1 className="text-lg font-bold tracking-tight">{t('dashboard.tabs.receipts')}</h1>
        </div>
      </div>

      <div className="p-4 sm:p-6 max-w-4xl w-full mx-auto flex flex-col gap-6">
        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /><span className="font-mono">{error}</span>
          </div>
        )}

        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border border-admin/40 bg-admin-soft text-admin-deep text-[12.5px] leading-relaxed">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>
            Business details are <b>snapshotted onto each receipt when it is issued</b> — edits here
            apply to future receipts only. Emails send from the configured sender via Resend
            (domain must be verified there).
          </span>
        </div>

        {/* ── Settings ── */}
        <section className="card flex flex-col gap-2" data-testid="receipt-settings">
          <h2 className="font-semibold text-ink mb-1">Receipt settings</h2>
          {RECEIPT_FIELDS.map(field => {
            const row = rows.find(r => r.key === field.key)
            const current = row?.value?.value
            const draft = drafts[field.key] ?? String(current ?? '')
            const dirty = draft !== String(current ?? '')
            const editorName = row?.editor?.full_name
            return (
              <div key={field.key} data-config-key={field.key} className="border-t border-edge first:border-t-0 py-3 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-ink">{field.label}</span>
                  <span className="font-mono text-[10.5px] text-ink-subtle">{field.key}</span>
                </div>
                <p className="text-[12.5px] text-ink-subtle">{field.hint}</p>
                <div className="flex items-center gap-2">
                  {field.options ? (
                    <select
                      className="input"
                      value={draft}
                      onChange={e => setDrafts(d => ({ ...d, [field.key]: e.target.value }))}
                    >
                      {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      inputMode={field.type === 'number' ? 'decimal' : 'text'}
                      dir="auto"
                      className="input"
                      value={draft}
                      onChange={e => setDrafts(d => ({ ...d, [field.key]: e.target.value }))}
                    />
                  )}
                  <button
                    onClick={() => save(field.key, draft)}
                    disabled={!dirty || busy}
                    className="btn-primary px-3 py-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                    title="Save"
                  >
                    <Save size={13} />
                  </button>
                </div>
                {(editorName || row?.updated_at) && (
                  <p className="text-[10.5px] text-ink-subtle">
                    Edited{editorName ? ` by ${editorName}` : ''}{row?.updated_at ? `, ${relativeTime(row.updated_at)}` : ''}
                  </p>
                )}
              </div>
            )
          })}
        </section>

        {/* ── Issued receipts ── */}
        <section className="card flex flex-col gap-2" data-testid="receipt-list">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className="font-semibold text-ink">Issued receipts</h2>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-ink-subtle">
                From
                <input
                  type="date"
                  data-testid="receipts-from"
                  className="input py-1.5"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={e => setFromDate(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-ink-subtle">
                To
                <input
                  type="date"
                  data-testid="receipts-to"
                  className="input py-1.5"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={e => setToDate(e.target.value)}
                />
              </label>
              {(fromDate || toDate) && (
                <button
                  onClick={() => { setFromDate(''); setToDate('') }}
                  className="btn-ghost px-2 py-1.5 text-[11px] flex items-center gap-1"
                  title="Clear date filter"
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>
          </div>
          <p className="text-[12.5px] text-ink-muted">
            {fromDate || toDate
              ? `Filtered by issue date${fromDate ? ` from ${fromDate}` : ''}${toDate ? ` to ${toDate}` : ''}, newest first (max ${RECEIPTS_LIMIT}).`
              : `Newest first (latest ${RECEIPTS_LIMIT}). Issued automatically when an order is completed.`}
          </p>

          {receipts.length === 0 && (
            <p className="text-[12.5px] text-ink-subtle py-4">
              {fromDate || toDate ? 'No receipts in the selected date range.' : 'No receipts issued yet.'}
            </p>
          )}

          {/* Mobile: cards */}
          <div className="lg:hidden flex flex-col gap-2 mt-2">
            {receipts.map(r => (
              <div key={r.id} className="rounded-xl border border-edge p-3 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] text-ink">#{r.receipt_number}</span>
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded ${STATUS_STYLES[r.status] ?? ''}`}>
                    {r.status}
                  </span>
                  <span className="ms-auto font-mono tabular-nums text-[12.5px]">₪{r.total}</span>
                </div>
                <p className="text-[12px] text-ink-muted truncate">
                  {r.consumer_name ?? '—'} · {r.consumer_email ?? '—'}
                </p>
                {r.error_detail && <p className="text-[10.5px] text-danger font-mono truncate" title={r.error_detail}>{r.error_detail}</p>}
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] text-ink-subtle">{relativeTime(r.created_at)}</span>
                  {r.pdf_path && (
                    <button
                      onClick={() => downloadPdf(r.pdf_path)}
                      className="ms-auto btn-ghost px-2 py-2 min-h-[44px] min-w-[44px] flex items-center gap-1 text-[11px]"
                      title="Download PDF"
                    >
                      <Download size={12} /> PDF
                    </button>
                  )}
                  <button
                    onClick={() => resend(r.id)}
                    disabled={busy || resending === r.id}
                    className={`${r.pdf_path ? '' : 'ms-auto '}btn-ghost px-2 py-2 min-h-[44px] min-w-[44px] flex items-center gap-1 text-[11px]`}
                    title="Resend email"
                  >
                    <Send size={12} /> {resending === r.id ? 'Sending…' : 'Resend'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <table className="hidden lg:table w-full text-sm mt-2">
            <thead className="text-ink-subtle">
              <tr className="text-[11px] uppercase tracking-wider">
                <th className="text-start py-1.5">#</th>
                <th className="text-start py-1.5">Customer</th>
                <th className="text-start py-1.5">Email</th>
                <th className="text-end py-1.5">Total ₪</th>
                <th className="text-start py-1.5 ps-3">Status</th>
                <th className="text-start py-1.5">Issued</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {receipts.map(r => (
                <tr key={r.id} className="border-t border-edge">
                  <td className="py-1.5 font-mono">#{r.receipt_number}</td>
                  <td className="py-1.5">{r.consumer_name ?? '—'}</td>
                  <td className="py-1.5 text-[12px] text-ink-muted">{r.consumer_email ?? '—'}</td>
                  <td className="py-1.5 text-end font-mono tabular-nums">{r.total}</td>
                  <td className="py-1.5 ps-3">
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded ${STATUS_STYLES[r.status] ?? ''}`}>
                      {r.status}
                    </span>
                    {r.error_detail && (
                      <span className="ms-2 text-[10px] text-danger font-mono" title={r.error_detail}>
                        {r.error_detail.slice(0, 40)}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-[11.5px] text-ink-subtle">{relativeTime(r.created_at)}</td>
                  <td className="py-1.5 text-end">
                    <div className="flex items-center gap-1 justify-end">
                      {r.pdf_path && (
                        <button
                          onClick={() => downloadPdf(r.pdf_path)}
                          className="btn-ghost px-2 py-1 text-[11px] flex items-center gap-1"
                          title="Download PDF"
                        >
                          <Download size={11} /> PDF
                        </button>
                      )}
                      <button
                        onClick={() => resend(r.id)}
                        disabled={busy || resending === r.id}
                        className="btn-ghost px-2 py-1 text-[11px] flex items-center gap-1"
                        title="Resend email"
                      >
                        <Send size={11} /> {resending === r.id ? 'Sending…' : 'Resend'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
