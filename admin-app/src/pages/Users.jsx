import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users as UsersIcon, AlertCircle, Search } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fetchUsers, ROLES, roleColor } from '../lib/adminUsers.js'
import { relativeTime } from '../lib/relativeTime.js'
import UserDetail from '../components/users/UserDetail.jsx'

function countByRole(rows) {
  const m = { all: rows.length }
  for (const r of rows) m[r.role] = (m[r.role] ?? 0) + 1
  return m
}

export default function Users() {
  const { t } = useTranslation()
  const [role, setRole]   = useState('all')
  const [query, setQuery] = useState('')
  const [rows, setRows]   = useState([])
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  async function load() {
    setBusy(true); setError(null)
    try {
      setRows(await fetchUsers({ role: 'all', limit: 500 }))
    } catch (e) { setError(e.message) }
    finally    { setBusy(false) }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const ch = supabase
      .channel('users-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const counts = useMemo(() => countByRole(rows), [rows])

  const filtered = useMemo(() => {
    let r = rows
    if (role !== 'all') r = r.filter(x => x.role === role)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      r = r.filter(x =>
        (x.full_name ?? '').toLowerCase().includes(q) ||
        (x.phone ?? '').toLowerCase().includes(q) ||
        (x.id ?? '').toLowerCase().includes(q)
      )
    }
    return r
  }, [rows, role, query])

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-edge bg-surface-elevated px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-3">
          <UsersIcon size={18} className="text-admin-deep" />
          <h1 className="text-lg font-bold tracking-tight">{t('dashboard.tabs.users')}</h1>
          <span className="ms-auto text-[11px] text-ink-muted tabular-nums">
            {rows.length} total · {filtered.length} shown
          </span>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="flex gap-1 overflow-x-auto no-scrollbar bg-surface rounded-xl p-1 border border-edge lg:flex-wrap lg:overflow-visible">
            {ROLES.map(r => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`shrink-0 whitespace-nowrap px-2.5 py-2 lg:py-1 text-[11px] font-semibold uppercase tracking-wider rounded-lg transition-colors ${
                  role === r ? 'bg-admin-soft text-admin-deep' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {r} <span className="tabular-nums opacity-60">({counts[r] ?? 0})</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 lg:flex-1 lg:min-w-[200px] bg-surface rounded-xl border border-edge px-3">
            <Search size={14} className="text-ink-subtle" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Name / phone / id"
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
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Mobile: stacked cards */}
        <div className="lg:hidden p-3 flex flex-col gap-2">
          {filtered.map(r => <UserCard key={r.id} row={r} onOpen={() => setSelectedId(r.id)} />)}
          {filtered.length === 0 && (
            <p className="px-3 py-12 text-center text-ink-subtle text-sm">{busy ? t('common.loading') : 'No users match this filter.'}</p>
          )}
        </div>

        {/* Desktop: table */}
        <table className="hidden lg:table w-full text-sm">
          <thead className="sticky top-0 bg-surface-elevated z-0 border-b border-edge">
            <tr className="text-ink-subtle text-[11px] uppercase tracking-wider">
              <th className="text-start px-6 py-2 font-semibold">User</th>
              <th className="text-start px-3 py-2 font-semibold">Role</th>
              <th className="text-start px-3 py-2 font-semibold">Phone</th>
              <th className="text-start px-3 py-2 font-semibold">Status</th>
              <th className="text-start px-3 py-2 font-semibold">Joined</th>
              <th className="px-6 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const suspended = !!r.suspended_at
              return (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`border-b border-edge hover:bg-surface-elevated-2/50 cursor-pointer ${suspended ? 'opacity-60' : ''}`}
                >
                  <td className="px-6 py-2.5 align-top">
                    <p className="text-ink font-medium">{r.full_name || '—'}</p>
                    <p className="text-[10.5px] text-ink-subtle font-mono">{r.id}</p>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${roleColor(r.role)}`}>
                      {r.role}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-top text-[12px] text-ink-muted">{r.phone || '—'}</td>
                  <td className="px-3 py-2.5 align-top">
                    {suspended ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider rounded border bg-danger/10 text-danger border-danger/30 px-2 py-0.5">suspended</span>
                    ) : r.role === 'washer' ? (
                      <span className="text-[11.5px] text-ink-muted">tier {r.current_tier ?? '—'} · {r.is_online ? 'online' : 'offline'}</span>
                    ) : r.role === 'agent' ? (
                      <span className="text-[11.5px] text-ink-muted">{r.agent_is_active ? 'active' : 'inactive'}</span>
                    ) : (
                      <span className="text-[11.5px] text-ink-subtle">—</span>
                    )}
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
              <tr><td colSpan={6} className="px-6 py-12 text-center text-ink-subtle text-sm">{busy ? t('common.loading') : 'No users match this filter.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <UserDetail
          userId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}

// Mobile-only card representation of a single user row.
function UserCard({ row, onOpen }) {
  const suspended = !!row.suspended_at
  return (
    <button
      onClick={onOpen}
      className={`w-full text-start card flex flex-col gap-2 active:bg-surface-elevated-2 ${suspended ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2">
        <p className="text-ink font-medium truncate flex-1">{row.full_name || '—'}</p>
        <span className={`shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${roleColor(row.role)}`}>
          {row.role}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-ink-muted truncate">{row.phone || '—'}</p>
        <span className="shrink-0">
          {suspended ? (
            <span className="text-[10px] font-bold uppercase tracking-wider rounded border bg-danger/10 text-danger border-danger/30 px-2 py-0.5">suspended</span>
          ) : row.role === 'washer' ? (
            <span className="text-[11.5px] text-ink-muted">tier {row.current_tier ?? '—'} · {row.is_online ? 'online' : 'offline'}</span>
          ) : row.role === 'agent' ? (
            <span className="text-[11.5px] text-ink-muted">{row.agent_is_active ? 'active' : 'inactive'}</span>
          ) : (
            <span className="text-[11.5px] text-ink-subtle">—</span>
          )}
        </span>
      </div>
      <p className="text-[10.5px] text-ink-subtle font-mono truncate">{row.id}</p>
    </button>
  )
}
