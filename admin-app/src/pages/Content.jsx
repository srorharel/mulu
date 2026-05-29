import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, RotateCcw, FileText, AlertCircle, Download } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { relativeTime } from '../lib/relativeTime.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

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

// Inflate dotted-key rows into nested objects — used for the export payload.
export function rowsToNested(rows) {
  const out = {}
  for (const { key, value } of rows) {
    const parts = key.split('.')
    let cur = out
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]
      if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {}
      cur = cur[p]
    }
    cur[parts.at(-1)] = value
  }
  return out
}

export default function Content() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [appId, setAppId] = useState('main')
  const [locale, setLocale] = useState('en')
  const [overrides, setOverrides] = useState({})    // key → { value, updated_at, editor_name }
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)       // { key, draft }
  const [confirming, setConfirming] = useState(null) // { key } for reset

  const app = APPS.find(a => a.id === appId) ?? APPS[0]
  const bundle = useMemo(() => flatten(app.bundles[locale] ?? {}), [app, locale])

  async function fetchOverrides() {
    setBusy(true)
    const { data, error: err } = await supabase
      .from('content_overrides')
      .select('key, value, updated_at, editor:updated_by(full_name)')
      .eq('app', appId)
      .eq('locale', locale)
    setBusy(false)
    if (err) { setError(err.message); return }
    setError(null)
    const map = {}
    for (const r of data ?? []) {
      map[r.key] = {
        value: r.value,
        updated_at: r.updated_at,
        editor_name: r.editor?.full_name ?? null,
      }
    }
    setOverrides(map)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchOverrides() }, [appId, locale])

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
    if (value === original) return removeOverride(key)
    const { error: err } = await supabase
      .from('content_overrides')
      .upsert({ app: appId, locale, key, value, updated_by: profile?.id, updated_at: new Date().toISOString() })
    if (err) { setError(err.message); return }
    setEditing(null)
    fetchOverrides()
  }

  async function removeOverride(key) {
    setError(null)
    const { error: err } = await supabase
      .from('content_overrides')
      .delete()
      .eq('app', appId).eq('locale', locale).eq('key', key)
    if (err) { setError(err.message); return }
    setEditing(null)
    setConfirming(null)
    fetchOverrides()
  }

  async function handleExport() {
    setBusy(true); setError(null)
    const { data, error: err } = await supabase
      .from('content_overrides')
      .select('app, locale, key, value')
    setBusy(false)
    if (err) { setError(err.message); return }
    const grouped = {}
    for (const r of data ?? []) {
      grouped[r.app] ??= {}
      grouped[r.app][r.locale] ??= []
      grouped[r.app][r.locale].push({ key: r.key, value: r.value })
    }
    const payload = {}
    for (const app of Object.keys(grouped)) {
      payload[app] = {}
      for (const loc of Object.keys(grouped[app])) {
        payload[app][loc] = rowsToNested(grouped[app][loc])
      }
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `content_overrides_${ts}.json`
    a.click()
    URL.revokeObjectURL(url)
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
      <div className="border-b border-edge bg-surface-elevated px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <FileText size={18} className="text-admin-deep" />
          <h1 className="text-lg font-bold tracking-tight">{t('dashboard.tabs.content')}</h1>
          <span className="ms-auto text-[11px] text-ink-muted tabular-nums">
            {Object.keys(bundle).length} keys · {overrideCount} overridden
          </span>
          <button
            onClick={handleExport}
            disabled={busy}
            className="btn-ghost text-[12px] flex items-center gap-1.5 shrink-0"
            title="Download all overrides (every app, every locale) as JSON"
          >
            <Download size={13} /> Export overrides
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-surface rounded-xl p-1 border border-edge">
            {APPS.map(a => (
              <button
                key={a.id}
                onClick={() => setAppId(a.id)}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${
                  appId === a.id ? 'bg-admin-soft text-admin-deep' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <div className="flex bg-surface rounded-xl p-1 border border-edge">
            {LOCALES.map(l => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`px-2.5 py-1.5 text-[11px] font-bold uppercase rounded-lg transition-colors ${
                  locale === l ? 'bg-admin-soft text-admin-deep' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
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

      <div className="flex-1 overflow-y-auto">
        {/* Mobile: stacked cards with inline edit */}
        <div className="lg:hidden p-3 flex flex-col gap-2">
          {filtered.map(([key, defaultValue]) => {
            const override = overrides[key]
            const isOverridden = !!override
            const isEditing = editing?.key === key
            return (
              <div key={key} className="card flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span className="font-mono text-[11.5px] text-ink-muted break-all flex-1">{key}</span>
                  {isOverridden && (
                    <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-admin-soft text-admin-deep">
                      overridden
                    </span>
                  )}
                </div>
                <div>
                  <p className="label-uppercase mb-0.5">Default</p>
                  <p className="text-[12.5px] text-ink-muted whitespace-pre-wrap break-words">{defaultValue}</p>
                </div>
                <div>
                  <p className="label-uppercase mb-1">Override</p>
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        autoFocus
                        rows={Math.min(8, (editing.draft.match(/\n/g)?.length ?? 0) + 2)}
                        value={editing.draft}
                        onChange={e => setEditing({ ...editing, draft: e.target.value })}
                        className="w-full bg-surface border border-admin rounded-lg px-2 py-1.5 text-[13px] text-ink outline-none resize-y"
                      />
                      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button onClick={() => setEditing(null)} className="btn-ghost w-full sm:w-auto text-sm">{t('common.cancel')}</button>
                        <button onClick={() => saveOverride(key, editing.draft)} className="btn-primary w-full sm:w-auto text-sm">{t('common.save')}</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setEditing({ key, draft: override?.value ?? defaultValue })}
                        className={`text-start w-full whitespace-pre-wrap break-words rounded-lg px-3 py-2 min-h-[44px] border border-edge ${
                          isOverridden ? 'text-ink font-medium bg-surface' : 'text-ink-subtle italic bg-surface'
                        }`}
                      >
                        {isOverridden ? override.value : 'Tap to add override'}
                      </button>
                      {isOverridden && (override.editor_name || override.updated_at) && (
                        <p className="text-[10.5px] text-ink-subtle mt-1">
                          Edited{override.editor_name ? ` by ${override.editor_name}` : ''}{override.updated_at ? `, ${relativeTime(override.updated_at)}` : ''}
                        </p>
                      )}
                      {isOverridden && (
                        <button
                          onClick={() => setConfirming({ key })}
                          className="mt-2 flex items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider rounded-lg text-ink-muted hover:text-danger"
                        >
                          <RotateCcw size={11} /> Reset to default
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-12 text-center text-ink-subtle text-sm">{busy ? t('common.loading') : 'No keys match this query.'}</p>
          )}
        </div>

        {/* Desktop: table */}
        <table className="hidden lg:table w-full text-sm">
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
              const override = overrides[key]
              const isOverridden = !!override
              const isEditing = editing?.key === key
              return (
                <tr key={key} className="border-b border-edge hover:bg-surface-elevated-2/50 group">
                  <td className="px-6 py-2.5 font-mono text-[12px] text-ink-muted align-top">
                    <span className="break-all">{key}</span>
                    {isOverridden && (
                      <span className="ms-2 inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-admin-soft text-admin-deep">
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
                      <>
                        <button
                          onClick={() => setEditing({ key, draft: override?.value ?? defaultValue })}
                          className={`text-start w-full whitespace-pre-wrap break-words rounded px-2 py-1 -mx-2 ${
                            isOverridden ? 'text-ink font-medium' : 'text-ink-subtle italic'
                          } hover:bg-surface`}
                        >
                          {isOverridden ? override.value : '—'}
                        </button>
                        {isOverridden && (override.editor_name || override.updated_at) && (
                          <p className="text-[10.5px] text-ink-subtle mt-0.5 px-2">
                            Edited{override.editor_name ? ` by ${override.editor_name}` : ''}{override.updated_at ? `, ${relativeTime(override.updated_at)}` : ''}
                          </p>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-6 py-2.5 align-top text-end whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => saveOverride(key, editing.draft)}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg text-zinc-900 bg-admin hover:bg-admin-deep hover:text-white transition-colors"
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
                        onClick={() => setConfirming({ key })}
                        className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-lg text-ink-muted hover:text-danger transition"
                      >
                        <RotateCcw size={10} />
                        Reset to default
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

      <ConfirmDialog
        open={!!confirming}
        title="Reset to bundled default?"
        message={confirming
          ? `Removes the override on ${appId}/${locale}/${confirming.key}. Apps will fall back to the bundled value on next load.`
          : ''}
        confirmLabel="Reset"
        destructive
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && removeOverride(confirming.key)}
      />
    </div>
  )
}
