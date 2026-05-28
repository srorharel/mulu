import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, RotateCcw, FileText, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

// Import each app's static bundle so we can list every key the admin can override.
import enMain from '../../../src/i18n/locales/en.json'
import heMain from '../../../src/i18n/locales/he.json'
import { resources as supportRes } from '../../../support-app/src/i18n/resources.js'
import { resources as adminRes } from '../i18n/resources.js'

const APPS = [
  { id: 'main',    label: 'Main app',    bundles: { en: enMain,                    he: heMain } },
  { id: 'support', label: 'Support app', bundles: { en: supportRes.en.translation, he: supportRes.he.translation } },
  { id: 'admin',   label: 'Admin app',   bundles: { en: adminRes.en.translation,   he: adminRes.he.translation } },
]

const LOCALES = ['en', 'he']

function flatten(obj, prefix = '') {
  const out = {}
  for (const k of Object.keys(obj ?? {})) {
    const v = obj[k]
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, path))
    } else if (typeof v === 'string') {
      out[path] = v
    }
  }
  return out
}

export default function Content() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [appId, setAppId] = useState('main')
  const [locale, setLocale] = useState('en')
  const [overrides, setOverrides] = useState({})
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // {key, draft}

  const app = APPS.find(a => a.id === appId) ?? APPS[0]
  const bundle = useMemo(() => flatten(app.bundles[locale] ?? {}), [app, locale])

  async function fetchOverrides() {
    setBusy(true)
    const { data, error: err } = await supabase
      .from('content_overrides')
      .select('key, value, updated_at')
      .eq('app', appId)
      .eq('locale', locale)
    setBusy(false)
    if (err) { setError(err.message); return }
    setError(null)
    const map = {}
    for (const r of data ?? []) map[r.key] = r.value
    setOverrides(map)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchOverrides() }, [appId, locale])

  // Realtime — admin editing on one tab updates other tabs live.
  useEffect(() => {
    const ch = supabase
      .channel(`content-overrides-admin:${appId}:${locale}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'content_overrides', filter: `app=eq.${appId}` },
        (payload) => {
          const row = payload.new ?? payload.old
          if (row?.locale === locale) fetchOverrides()
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, locale])

  async function saveOverride(key, value) {
    setError(null)
    const original = bundle[key] ?? ''
    if (value === original) {
      // Saving the original value clears the override.
      return removeOverride(key)
    }
    const { error: err } = await supabase
      .from('content_overrides')
      .upsert({ app: appId, locale, key, value, updated_by: profile?.id })
    if (err) { setError(err.message); return }
    setOverrides(prev => ({ ...prev, [key]: value }))
    setEditing(null)
  }

  async function removeOverride(key) {
    setError(null)
    const { error: err } = await supabase
      .from('content_overrides')
      .delete()
      .eq('app', appId).eq('locale', locale).eq('key', key)
    if (err) { setError(err.message); return }
    setOverrides(prev => { const c = { ...prev }; delete c[key]; return c })
    setEditing(null)
  }

  const filtered = useMemo(() => {
    const entries = Object.entries(bundle)
    if (!query) return entries
    const q = query.toLowerCase()
    return entries.filter(([k, v]) => k.toLowerCase().includes(q) || v.toLowerCase().includes(q))
  }, [bundle, query])

  const overrideCount = Object.keys(overrides).length

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-edge bg-surface-elevated px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={18} className="text-admin" />
          <h1 className="text-lg font-bold tracking-tight">{t('dashboard.tabs.content')}</h1>
          <span className="ms-auto text-[11px] text-ink-muted tabular-nums">
            {Object.keys(bundle).length} keys · {overrideCount} overridden
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* App selector */}
          <div className="flex bg-surface rounded-xl p-1 border border-edge">
            {APPS.map(a => (
              <button
                key={a.id}
                onClick={() => setAppId(a.id)}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${
                  appId === a.id ? 'bg-admin-soft text-admin' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          {/* Locale toggle */}
          <div className="flex bg-surface rounded-xl p-1 border border-edge">
            {LOCALES.map(l => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`px-2.5 py-1.5 text-[11px] font-bold uppercase rounded-lg transition-colors ${
                  locale === l ? 'bg-admin-soft text-admin' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-surface rounded-xl border border-edge px-3">
            <Search size={14} className="text-ink-subtle" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('common.search')}
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

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-elevated z-0 border-b border-edge">
            <tr className="text-ink-subtle text-[11px] uppercase tracking-wider">
              <th className="text-start px-6 py-2 font-semibold w-[34%]">Key</th>
              <th className="text-start px-3 py-2 font-semibold w-[28%]">Default</th>
              <th className="text-start px-3 py-2 font-semibold">Override</th>
              <th className="px-6 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(([key, defaultValue]) => {
              const isOverridden = key in overrides
              const isEditing = editing?.key === key
              const overrideValue = overrides[key]
              return (
                <tr key={key} className="border-b border-edge hover:bg-surface-elevated/30 group">
                  <td className="px-6 py-2.5 font-mono text-[12px] text-ink-muted align-top">
                    <span className="break-all">{key}</span>
                    {isOverridden && (
                      <span className="ms-2 inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-admin-soft text-admin">
                        overridden
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-muted align-top whitespace-pre-wrap break-words">
                    {defaultValue}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    {isEditing ? (
                      <textarea
                        autoFocus
                        rows={Math.min(8, (editing.draft.match(/\n/g)?.length ?? 0) + 1)}
                        value={editing.draft}
                        onChange={e => setEditing({ ...editing, draft: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveOverride(key, editing.draft) }
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        className="w-full bg-surface border border-admin rounded-lg px-2 py-1.5 text-[12px] text-ink outline-none resize-y"
                      />
                    ) : (
                      <button
                        onClick={() => setEditing({ key, draft: overrideValue ?? defaultValue })}
                        className={`text-start w-full whitespace-pre-wrap break-words rounded px-2 py-1 -mx-2 ${
                          isOverridden ? 'text-ink font-medium' : 'text-ink-subtle italic'
                        } hover:bg-surface`}
                      >
                        {isOverridden ? overrideValue : '—'}
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-2.5 align-top text-end whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => saveOverride(key, editing.draft)}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg text-surface bg-admin hover:bg-admin-deep transition-colors"
                        >
                          {t('common.save')}
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg text-ink-muted hover:text-ink hover:bg-surface transition-colors"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : isOverridden ? (
                      <button
                        onClick={() => removeOverride(key)}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-lg text-ink-muted hover:text-danger transition"
                      >
                        <RotateCcw size={10} />
                        {t('common.restore')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-ink-subtle text-sm">{busy ? t('common.loading') : 'No keys match this query.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
