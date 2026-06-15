import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardList, AlertCircle, Search, Plus, Sparkles, Car, MapPin, User, Droplets } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fetchJobs, STATUSES, statusColor } from '../lib/adminJobs.js'
import { relativeTime } from '../lib/relativeTime.js'
import JobDetail from '../components/jobs/JobDetail.jsx'
import CreateOrderForm from '../components/jobs/CreateOrderForm.jsx'
import PageHeader from '../components/PageHeader.jsx'

// Counts the rows of each status in the current jobs array so the filter
// pills can show "(N)" without a separate query.
function countByStatus(rows) {
  const map = { all: rows.length }
  for (const r of rows) map[r.status] = (map[r.status] ?? 0) + 1
  return map
}

// Human vehicle description from the discrete car_* columns, falling back to the
// booking category (car_type) when make/model were never captured (e.g. some
// admin-created orders). Mirrors the JobDetail composition.
function vehicleLabel(row) {
  const make = [row.car_make, row.car_model, row.car_year].filter(Boolean).join(' ')
  return make || row.car_type || '—'
}

// One compact "Customer / Washer" cell used in the mobile card.
function Party({ icon: Icon, label, name, empty }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon size={13} className="text-ink-subtle shrink-0" />
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wider text-ink-subtle leading-none mb-0.5">{label}</p>
        <p className={`text-[12px] truncate leading-tight ${name ? 'text-ink' : 'text-ink-subtle italic'}`}>
          {name || empty || '—'}
        </p>
      </div>
    </div>
  )
}

export default function Jobs() {
  const { t } = useTranslation()
  const [status, setStatus]   = useState('all')
  const [rows, setRows]       = useState([])
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState(null)
  const [query, setQuery]     = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating]     = useState(false)

  async function load() {
    setBusy(true); setError(null)
    try {
      // Fetch ALL rows (filter client-side) so the counts pill is accurate.
      const data = await fetchJobs({ status: 'all', limit: 500 })
      setRows(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { load() }, [])

  // Realtime — any insert/update on orders refreshes the list. Cheap because
  // the admin tab is rarely open and updates are infrequent.
  useEffect(() => {
    const ch = supabase
      .channel('jobs-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const counts = useMemo(() => countByStatus(rows), [rows])

  const filtered = useMemo(() => {
    let r = rows
    if (status !== 'all') r = r.filter(x => x.status === status)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      r = r.filter(x =>
        (x.id ?? '').toLowerCase().includes(q) ||
        (x.car_plate ?? '').toLowerCase().includes(q) ||
        (x.address_label ?? '').toLowerCase().includes(q)
      )
    }
    return r
  }, [rows, status, query])

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        icon={ClipboardList}
        title={t('dashboard.tabs.jobs')}
        right={
          <>
            <span className="text-[11px] text-ink-muted tabular-nums">
              {rows.length} total · {filtered.length} shown
            </span>
            <button
              onClick={() => setCreating(true)}
              className="btn-primary text-[12px] flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[44px] sm:min-h-0"
              title="Create an order on behalf of a consumer"
            >
              <Plus size={14} /> Create order
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="flex gap-1 overflow-x-auto no-scrollbar bg-surface rounded-xl p-1 border border-edge lg:flex-wrap lg:overflow-visible">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`shrink-0 whitespace-nowrap px-2.5 py-2 lg:py-1 text-[11px] font-semibold uppercase tracking-wider rounded-lg transition-colors ${
                  status === s ? 'bg-admin-soft text-admin-deep' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {s} <span className="tabular-nums opacity-60">({counts[s] ?? 0})</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 lg:flex-1 lg:min-w-[180px] bg-surface rounded-xl border border-edge px-3">
            <Search size={14} className="text-ink-subtle" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ID / plate / address"
              className="flex-1 bg-transparent outline-none text-sm py-2"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span className="font-mono">{error}</span>
          </div>
        )}
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        {/* Mobile: stacked cards */}
        <div className="lg:hidden p-3 flex flex-col gap-2">
          {filtered.map(r => <JobCard key={r.id} row={r} onOpen={() => setSelectedId(r.id)} />)}
          {filtered.length === 0 && (
            <p className="px-3 py-12 text-center text-ink-subtle text-sm">{busy ? t('common.loading') : 'No jobs match this filter.'}</p>
          )}
        </div>

        {/* Desktop: table */}
        <table className="hidden lg:table w-full text-sm">
          <thead className="sticky top-0 bg-surface-elevated z-0 border-b border-edge">
            <tr className="text-ink-subtle text-[11px] uppercase tracking-wider">
              <th className="text-start px-6 py-2 font-semibold">Order</th>
              <th className="text-start px-3 py-2 font-semibold">Status</th>
              <th className="text-start px-3 py-2 font-semibold">Customer</th>
              <th className="text-start px-3 py-2 font-semibold">Washer</th>
              <th className="text-start px-3 py-2 font-semibold">Vehicle</th>
              <th className="text-end px-3 py-2 font-semibold">Price</th>
              <th className="text-start px-3 py-2 font-semibold">Created</th>
              <th className="px-6 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const isAdminCreated = !!r.created_by_admin
              return (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className="border-b border-edge hover:bg-surface-elevated-2/50 cursor-pointer"
                >
                  <td className="px-6 py-2.5 align-top text-[12px] text-ink-muted">
                    <div className="flex items-center gap-1.5">
                      <span title={r.id} className="font-mono truncate inline-block max-w-[90px]">{r.id?.slice(0, 8)}…</span>
                      {isAdminCreated && (
                        <span title="Created by admin" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-admin-soft text-admin-deep">
                          <Sparkles size={9} /> admin
                        </span>
                      )}
                    </div>
                    {r.address_label && (
                      <p className="flex items-center gap-1 text-[10.5px] text-ink-subtle mt-0.5 max-w-[240px]">
                        <MapPin size={11} className="shrink-0" />
                        <span className="truncate">{r.address_label}</span>
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${statusColor(r.status)}`}>
                      {r.status}
                    </span>
                    {r.decline_count > 0 && (
                      <p className="text-[10px] text-danger mt-1">{r.decline_count}× declined</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top text-[12px]">
                    <p className={`truncate max-w-[150px] ${r.consumer?.full_name ? 'text-ink' : 'text-ink-subtle'}`}>
                      {r.consumer?.full_name || '—'}
                    </p>
                    {r.consumer?.phone && <p className="text-[10.5px] text-ink-subtle tabular-nums">{r.consumer.phone}</p>}
                  </td>
                  <td className="px-3 py-2.5 align-top text-[12px]">
                    <p className={`truncate max-w-[150px] ${r.washer?.full_name ? 'text-ink' : 'text-ink-subtle italic'}`}>
                      {r.washer?.full_name || 'Unassigned'}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 align-top text-[12px] text-ink-muted">
                    <p className="text-ink truncate max-w-[170px]">{vehicleLabel(r)}</p>
                    <p className="font-mono text-[10.5px] text-ink-subtle">{r.car_plate || '—'}</p>
                  </td>
                  <td className="px-3 py-2.5 align-top text-[12px] text-ink-muted tabular-nums text-end">
                    <p className="text-ink">₪{Number(r.total_price ?? 0)}</p>
                    <p className="text-[10.5px] text-ink-subtle">payout ₪{Number(r.payout_amount ?? r.base_price ?? 0)}</p>
                  </td>
                  <td className="px-3 py-2.5 align-top text-[11px] text-ink-muted">{relativeTime(r.created_at)}</td>
                  <td className="px-6 py-2.5 align-top text-end">
                    <button
                      className="text-[11px] font-semibold text-admin-deep hover:underline"
                      onClick={(e) => { e.stopPropagation(); setSelectedId(r.id) }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-ink-subtle text-sm">{busy ? t('common.loading') : 'No jobs match this filter.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <JobDetail
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
      {creating && (
        <CreateOrderForm
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); setSelectedId(id); load() }}
        />
      )}
    </div>
  )
}

// Mobile-only card representation of a single order row.
function JobCard({ row, onOpen }) {
  const isAdminCreated = !!row.created_by_admin
  return (
    <button
      onClick={onOpen}
      className="w-full text-start card flex flex-col gap-2.5 active:bg-surface-elevated-2"
    >
      {/* Status + flags + age */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${statusColor(row.status)}`}>
          {row.status}
        </span>
        {isAdminCreated && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-admin-soft text-admin-deep">
            <Sparkles size={9} /> admin
          </span>
        )}
        {row.decline_count > 0 && (
          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-danger/10 text-danger">
            {row.decline_count}× declined
          </span>
        )}
        <span className="ms-auto text-[10.5px] text-ink-subtle shrink-0">{relativeTime(row.created_at)}</span>
      </div>

      {/* Vehicle + plate */}
      <div className="flex items-center gap-2 min-w-0">
        <Car size={14} className="text-ink-subtle shrink-0" />
        <span className="text-[13px] text-ink truncate">{vehicleLabel(row)}</span>
        <span className="ms-auto font-mono text-[12px] text-ink-muted shrink-0">{row.car_plate || '—'}</span>
      </div>

      {/* Address */}
      {row.address_label && (
        <div className="flex items-center gap-2 min-w-0">
          <MapPin size={13} className="text-ink-subtle shrink-0" />
          <span className="text-[12px] text-ink-muted truncate">{row.address_label}</span>
        </div>
      )}

      <div className="border-t border-edge" />

      {/* Customer / Washer */}
      <div className="grid grid-cols-2 gap-2">
        <Party icon={User} label="Customer" name={row.consumer?.full_name} />
        <Party icon={Droplets} label="Washer" name={row.washer?.full_name} empty="Unassigned" />
      </div>

      {/* Money + id */}
      <div className="flex items-end justify-between gap-2">
        <span className="font-mono text-[10.5px] text-ink-subtle">{row.id?.slice(0, 8)}…</span>
        <div className="text-end tabular-nums shrink-0">
          <span className="text-[14px] text-ink">₪{Number(row.total_price ?? 0)}</span>
          <span className="text-[10.5px] text-ink-subtle ms-2">payout ₪{Number(row.payout_amount ?? row.base_price ?? 0)}</span>
        </div>
      </div>
    </button>
  )
}
