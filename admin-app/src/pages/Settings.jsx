import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings as SettingsIcon, Upload, Trash2, AlertCircle, Image as ImageIcon } from 'lucide-react'
import { useAdminBackground } from '../context/BackgroundContext.jsx'
import { validateFile, clampOpacity, OPACITY_MAX, OPACITY_DEFAULT } from '../lib/adminBackground.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import PageHeader from '../components/PageHeader.jsx'

// Appearance tab — PERSONAL, PRIVATE console background for the signed-in admin.
// Changes apply live to the shell (via BackgroundContext) and persist without a
// save button: opacity is debounced; upload / toggle / remove persist on action.
export default function Settings() {
  const { t } = useTranslation()
  const bg = useAdminBackground()
  const fileRef = useRef(null)
  const saveTimer = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)

  // If no provider is mounted (defensive — App wraps it in real use), render nothing.
  if (!bg) return null

  const { imageUrl, imagePath, opacity, enabled } = bg
  const hasImage = !!imagePath

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    const v = validateFile(file)
    if (!v.ok) { setError(v.error); return }
    setBusy(true); setError(null)
    try { await bg.upload(file) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  function handleOpacity(e) {
    const next = clampOpacity(e.target.value)
    bg.setOpacityLive(next)                                  // live preview
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { bg.persistOpacity(next).catch(() => {}) }, 400)
  }

  async function handleToggle() {
    setError(null)
    try { await bg.setEnabled(!enabled) } catch (err) { setError(err.message) }
  }

  async function handleRemove() {
    setConfirming(false); setBusy(true); setError(null)
    try { await bg.remove() } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const pct = Math.round(opacity * 100)

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        icon={SettingsIcon}
        title={t('dashboard.tabs.appearance')}
        right={hasImage ? (
          <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded ${
            enabled ? 'bg-admin-soft text-admin-deep' : 'bg-surface text-ink-subtle border border-edge'
          }`}>
            {enabled ? 'active' : 'disabled'}
          </span>
        ) : null}
      />

      <div className="p-4 sm:p-6 max-w-3xl w-full mx-auto flex flex-col gap-4">
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border border-admin/30 bg-admin-soft text-ink-muted text-[12.5px] leading-relaxed">
          <ImageIcon size={18} className="shrink-0 mt-0.5 text-admin-deep" />
          <p>
            This background is <span className="font-semibold text-ink">personal and private to you</span>.
            Only you ever see it. It never affects other admins, consumers, washers, or agents. A faint wash
            keeps the console readable; opacity is capped at {Math.round(OPACITY_MAX * 100)}%.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span className="font-mono">{error}</span>
          </div>
        )}

        <div className="border border-edge rounded-2xl bg-surface-elevated overflow-hidden">
          {/* Preview tile — mirrors the shell: image @ opacity over the surface base. */}
          <div className="relative h-40 sm:h-48 bg-surface border-b border-edge overflow-hidden">
            {hasImage && enabled && imageUrl ? (
              <>
                <div
                  data-testid="appearance-preview"
                  className="absolute inset-0 bg-center bg-cover"
                  style={{ backgroundImage: `url("${imageUrl}")`, opacity }}
                />
                {/* A sample card so you can judge legibility over the chosen image. */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="px-4 py-3 rounded-xl bg-surface-elevated border border-edge shadow-sm text-center">
                    <p className="text-[12px] font-semibold text-ink">Sample panel</p>
                    <p className="text-[11px] text-ink-muted">Data stays legible over the wash.</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-ink-subtle text-[12px]">
                {hasImage ? 'Background disabled. Plain console.' : 'No background. Plain console.'}
              </div>
            )}
          </div>

          {/* Upload */}
          <label className="block px-5 py-4 cursor-pointer hover:bg-surface transition-colors border-b border-edge">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
              disabled={busy}
            />
            <div className="flex items-center gap-3">
              <Upload size={16} className="text-admin-deep" />
              <span className="text-[13px] text-ink">
                {hasImage ? 'Replace background' : 'Upload background'}
                <span className="text-ink-subtle"> · photo or file (jpg/png/webp, max 10 MB)</span>
              </span>
            </div>
          </label>

          {/* Opacity */}
          <div className="px-5 py-4 border-b border-edge">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="bg-opacity" className="text-[13px] font-medium text-ink">Opacity</label>
              <span className="text-[12px] text-ink-muted tabular-nums">{pct}%</span>
            </div>
            <input
              id="bg-opacity"
              type="range"
              min={0}
              max={OPACITY_MAX}
              step={0.01}
              value={opacity}
              onChange={handleOpacity}
              disabled={!hasImage}
              className="w-full accent-admin disabled:opacity-40"
            />
            <p className="text-[11px] text-ink-subtle mt-1">
              How strongly the image shows through. Capped at {Math.round(OPACITY_MAX * 100)}% so text stays readable.
            </p>
          </div>

          {/* Enable toggle */}
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-ink">Show background</p>
              <p className="text-[11px] text-ink-subtle">Turn the image on or off without deleting it.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Show background"
              onClick={handleToggle}
              disabled={!hasImage}
              className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-40 ${
                enabled && hasImage ? 'bg-admin' : 'bg-surface-high'
              }`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                enabled && hasImage ? 'start-[22px]' : 'start-0.5'
              }`} />
            </button>
          </div>

          {hasImage && (
            <div className="px-5 py-3 border-t border-edge">
              <button
                onClick={() => setConfirming(true)}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg text-ink-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={12} />
                Remove background
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Remove your background?"
        message="Deletes your uploaded image and reverts to the plain console background. This affects only your account."
        confirmLabel="Remove"
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={handleRemove}
      />
    </div>
  )
}
