import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Trash2, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import { fetchCannedResponses, createCannedResponse, deleteCannedResponse } from '../lib/support.js'

export default function Settings() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { profile, refreshProfile } = useAuth()

  const [displayName, setDisplayName] = useState(profile?.agent_display_name || '')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [saveError, setSaveError] = useState(false)

  const [canned, setCanned] = useState([])
  const [newShortcut, setNewShortcut] = useState('')
  const [newBodyHe, setNewBodyHe] = useState('')
  const [newBodyEn, setNewBodyEn] = useState('')
  const [addingCanned, setAddingCanned] = useState(false)

  useEffect(() => {
    if (profile) loadCanned()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pre-existing — filed separately for follow-up
  }, [profile])

  async function loadCanned() {
    const { data } = await fetchCannedResponses(profile.id)
    setCanned((data ?? []).filter(c => c.agent_id === profile.id))
  }

  async function saveProfile() {
    setSaving(true)
    setSaveError(false)
    const { error } = await supabase.from('profiles').update({ agent_display_name: displayName }).eq('id', profile.id)
    if (!error) await refreshProfile()
    setSaving(false)
    if (error) { setSaveError(true); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleAddCanned() {
    if (!newShortcut || !newBodyHe || !newBodyEn) return
    setAddingCanned(true)
    await createCannedResponse(profile.id, {
      shortcut: newShortcut.startsWith('/') ? newShortcut : `/${newShortcut}`,
      body_he: newBodyHe,
      body_en: newBodyEn,
    })
    setNewShortcut('')
    setNewBodyHe('')
    setNewBodyEn('')
    await loadCanned()
    setAddingCanned(false)
  }

  async function handleDeleteCanned(id) {
    await deleteCannedResponse(id)
    await loadCanned()
  }

  function toggleLang() {
    const next = i18n.language === 'he' ? 'en' : 'he'
    i18n.changeLanguage(next)
    document.documentElement.dir = next === 'he' ? 'rtl' : 'ltr'
    document.documentElement.lang = next
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-edge bg-surface-elevated">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2 rounded-xl">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </button>
        <h1 className="font-bold text-ink">{t('settings.title')}</h1>
      </header>

      <div className="max-w-xl mx-auto p-4 flex flex-col gap-6">
        {/* Display name */}
        <div className="card flex flex-col gap-3">
          <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
            {t('settings.displayName')}
          </label>
          <input
            className="input"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
          />
          <button onClick={saveProfile} disabled={saving} className="btn-primary w-fit">
            {saved ? t('settings.saved') : saving ? t('common.loading') : t('settings.save')}
          </button>
          {saveError && <p className="text-xs text-danger-500">{t('common.error')}</p>}
        </div>

        {/* Language */}
        <div className="card flex items-center justify-between">
          <span className="text-sm text-ink">{t('settings.language')}</span>
          <button onClick={toggleLang} className="btn-ghost text-sm">
            {i18n.language === 'he' ? 'English' : 'עברית'}
          </button>
        </div>

        {/* Canned responses */}
        <div className="card flex flex-col gap-4">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('settings.canned')}</p>

          {canned.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('settings.cannedEmpty')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {canned.map(c => (
                <div key={c.id} className="flex items-start gap-2 p-3 rounded-xl bg-surface border border-edge">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-accent">{c.shortcut}</p>
                    <p className="text-sm text-ink truncate">{i18n.language === 'he' ? c.body_he : c.body_en}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteCanned(c.id)}
                    className="shrink-0 p-1.5 text-danger-500 hover:bg-danger-50/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2 border-t border-edge">
            <p className="text-xs font-semibold text-ink-muted">{t('settings.addCanned')}</p>
            <input className="input text-sm" placeholder={t('settings.shortcut') + ' (e.g. /eta)'} value={newShortcut} onChange={e => setNewShortcut(e.target.value)} />
            <input className="input text-sm" placeholder={t('settings.bodyHe')} value={newBodyHe} onChange={e => setNewBodyHe(e.target.value)} />
            <input className="input text-sm" placeholder={t('settings.bodyEn')} value={newBodyEn} onChange={e => setNewBodyEn(e.target.value)} />
            <button onClick={handleAddCanned} disabled={addingCanned || !newShortcut || !newBodyHe || !newBodyEn} className="btn-primary w-fit">
              <Plus className="h-4 w-4" />
              {t('settings.addCanned')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
