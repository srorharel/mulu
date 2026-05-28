import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Upload, RotateCcw, AlertTriangle, Smartphone, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

const SLOTS = [
  {
    slug: 'main_logo',
    label: 'Main app logo',
    bundled: '/logo.png',
    description: 'Used on the consumer landing page.',
  },
  {
    slug: 'support_logo',
    label: 'Support-app logo',
    bundled: '/wash-logo.png',
    description: 'Used on the agent dashboard sidebar and login.',
  },
  {
    slug: 'login_hero',
    label: 'Login hero',
    bundled: '',
    description: 'Optional decorative image for the consumer login screen.',
  },
]

const BUCKET = 'brand-assets'

function publicUrl(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl
}

export default function Branding() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [rows, setRows] = useState({})    // slug → { url, updated_at }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function refresh() {
    setBusy(true)
    const { data, error: err } = await supabase
      .from('app_branding')
      .select('slug, url, updated_at')
    setBusy(false)
    if (err) { setError(err.message); return }
    setError(null)
    const map = {}
    for (const r of data ?? []) map[r.slug] = r
    setRows(map)
  }

  useEffect(() => { refresh() }, [])

  async function handleUpload(slug, file) {
    if (!file) return
    setBusy(true); setError(null)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${slug}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '60',
      upsert: false,
      contentType: file.type || undefined,
    })
    if (upErr) { setError(upErr.message); setBusy(false); return }
    const url = publicUrl(path)
    const { error: dbErr } = await supabase
      .from('app_branding')
      .upsert({ slug, url, updated_by: profile?.id })
    setBusy(false)
    if (dbErr) { setError(dbErr.message); return }
    refresh()
  }

  async function handleRestore(slug) {
    setBusy(true); setError(null)
    const { error: err } = await supabase
      .from('app_branding')
      .delete()
      .eq('slug', slug)
    setBusy(false)
    if (err) { setError(err.message); return }
    refresh()
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-edge bg-surface-elevated px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Image size={18} className="text-admin-deep" />
          <h1 className="text-lg font-bold tracking-tight">{t('dashboard.tabs.branding')}</h1>
          <span className="ms-auto text-[11px] text-ink-muted tabular-nums">
            {Object.keys(rows).length} overrides
          </span>
        </div>
      </div>

      <div className="p-6 max-w-3xl w-full mx-auto flex flex-col gap-4">
        {/* MOBILE BAKE BANNER — mandatory per P3 spec */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border border-warning/40 bg-warning/10 text-warning text-sm">
          <Smartphone size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-0.5">Mobile bake limit</p>
            <p className="text-warning/90 text-[12.5px] leading-relaxed">
              Already-installed mobile apps keep their bundled launcher icon and splash until the next app-store update.
              Web users see changes on next load. Android launcher icons and splash screens are NOT swappable from this panel.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span className="font-mono">{error}</span>
          </div>
        )}

        {SLOTS.map(slot => {
          const row = rows[slot.slug]
          const overrideUrl = row?.url
          return (
            <BrandingRow
              key={slot.slug}
              slot={slot}
              overrideUrl={overrideUrl}
              row={row}
              busy={busy}
              onUpload={(file) => handleUpload(slot.slug, file)}
              onRestore={() => handleRestore(slot.slug)}
              t={t}
            />
          )
        })}
      </div>
    </div>
  )
}

function BrandingRow({ slot, overrideUrl, row, busy, onUpload, onRestore, t }) {
  const fileRef = useRef(null)
  const [drag, setDrag] = useState(false)
  const isOverridden = !!overrideUrl

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (f) onUpload(f)
    if (fileRef.current) fileRef.current.value = ''
  }
  function handleDrop(e) {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f) onUpload(f)
  }

  return (
    <div className="border border-edge rounded-2xl bg-surface-elevated overflow-hidden">
      <div className="px-5 py-4 flex items-start gap-4 border-b border-edge">
        <div
          className="w-20 h-20 rounded-xl bg-surface border border-edge overflow-hidden flex items-center justify-center shrink-0"
        >
          {(overrideUrl || slot.bundled) ? (
            <img src={overrideUrl || slot.bundled} alt="" className="max-w-full max-h-full object-contain" />
          ) : (
            <Image size={24} className="text-ink-subtle" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-ink">{slot.label}</h2>
            {isOverridden && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-admin-soft text-admin-deep">
                overridden
              </span>
            )}
          </div>
          <p className="text-[12px] text-ink-muted mt-0.5">{slot.description}</p>
          <p className="text-[11px] text-ink-subtle mt-1 font-mono break-all">
            <span className="text-ink-subtle">slug:</span> {slot.slug}
          </p>
          {row?.updated_at && (
            <p className="text-[10.5px] text-ink-subtle mt-0.5">
              updated {new Date(row.updated_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <label
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        className={`block px-5 py-3 cursor-pointer transition-colors ${
          drag ? 'bg-admin-soft' : 'hover:bg-surface'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          className="hidden"
          onChange={handleFileChange}
          disabled={busy}
        />
        <div className="flex items-center gap-3">
          <Upload size={16} className="text-admin-deep" />
          <span className="text-[13px] text-ink">{t('common.upload')}: drop a file or click to browse (jpg/png/webp/svg, max 10 MB)</span>
        </div>
      </label>

      {isOverridden && (
        <div className="px-5 py-3 border-t border-edge flex items-center gap-3">
          <button
            onClick={onRestore}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg text-ink-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={12} />
            {t('common.restore')}
          </button>
          <a
            href={overrideUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-ink-subtle hover:text-ink font-mono truncate flex-1"
          >
            {overrideUrl}
          </a>
        </div>
      )}
    </div>
  )
}
