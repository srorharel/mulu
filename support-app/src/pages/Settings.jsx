import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Plus, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import { fetchCannedResponses, createCannedResponse, deleteCannedResponse } from '../lib/support.js'
import LeftRail from '../components/LeftRail.jsx'

export default function Settings() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { profile, refreshProfile, signOut } = useAuth()

  const [displayName, setDisplayName] = useState(profile?.agent_display_name || '')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [saveError, setSaveError] = useState(false)

  const [canned, setCanned]         = useState([])
  const [newShortcut, setNewShortcut] = useState('')
  const [newBodyHe, setNewBodyHe]   = useState('')
  const [newBodyEn, setNewBodyEn]   = useState('')
  const [addingCanned, setAddingCanned] = useState(false)

  useEffect(() => {
    if (profile) loadCanned()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="flex flex-col md:flex-row h-screen bg-surface overflow-hidden">
      <LeftRail
        activeTab="settings"
        // Only '/' and '/unassigned' are real routes — every other tab lives
        // in Dashboard state, so pass it via location.state (navigating to
        // /approvals etc. hits the wildcard redirect and lands on 'conv').
        onTabChange={(tab) => navigate(tab === 'unassigned' ? '/unassigned' : '/', { state: { tab } })}
        profile={profile}
        onSettings={() => {}}
        onSignOut={signOut}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6">
          {/* Mobile back + title */}
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="md:hidden p-1.5 -ms-1 rounded-lg text-ink-muted hover:text-ink transition-colors" aria-label={t('common.back')}>
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl md:text-[24px] font-extrabold text-ink" style={{ letterSpacing: '-0.5px' }}>
              {t('settings.title')}
            </h1>
          </div>

          {/* Display name */}
          <div className="card flex flex-col gap-3">
            <label className={`text-xs text-ink-muted ${i18n.language === 'en' ? 'font-semibold uppercase tracking-wide' : 'font-bold'}`}>
              {t('settings.displayName')}
            </label>
            <input
              className="w-full h-12 rounded-xl border border-edge bg-surface-elevated px-4 text-sm text-ink outline-none placeholder:text-ink-subtle transition focus:border-agent focus:ring-1 focus:ring-agent/30"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={t('settings.displayNamePlaceholder')}
            />
            <div className="flex items-center gap-3">
              <button onClick={saveProfile} disabled={saving} className="btn-primary w-fit h-12">
                {saved ? t('settings.saved') : saving ? t('common.loading') : t('settings.save')}
              </button>
              {saveError && <p className="text-xs text-danger">{t('common.error')}</p>}
            </div>
          </div>

          {/* Language */}
          <div className="card flex flex-col gap-3">
            <label className={`text-xs text-ink-muted ${i18n.language === 'en' ? 'font-semibold uppercase tracking-wide' : 'font-bold'}`}>
              {t('settings.language')}
            </label>
            <p className="text-sm text-ink-muted">
              {t('settings.languageHelper')}
            </p>
            <div className="flex gap-2">
              {['he', 'en'].map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => {
                    i18n.changeLanguage(lng)
                    localStorage.setItem('support_locale', lng)
                    document.documentElement.dir = lng === 'he' ? 'rtl' : 'ltr'
                    document.documentElement.lang = lng
                  }}
                  className={`flex-1 h-12 rounded-xl font-semibold transition ${
                    i18n.language === lng
                      ? 'bg-agent text-white'
                      : 'bg-surface-elevated text-ink border border-edge'
                  }`}
                >
                  {t(`settings.languageOptions.${lng}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Sign out — mobile only (desktop has it in LeftRail) */}
          <button
            onClick={signOut}
            className="md:hidden btn-ghost text-sm text-danger h-12 justify-start"
          >
            {t('common.signOut')}
          </button>

          {/* Canned responses */}
          <div className="card flex flex-col gap-4">
            <p className={`text-xs text-ink-muted ${i18n.language === 'en' ? 'font-semibold uppercase tracking-wide' : 'font-bold'}`}>
              {t('settings.canned')}
            </p>

            {canned.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('settings.cannedEmpty')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {canned.map(c => (
                  <div key={c.id} className="flex items-start gap-2 p-3 rounded-xl bg-surface border border-edge">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-agent">{c.shortcut}</p>
                      <p className="text-sm text-ink truncate">{i18n.language === 'he' ? c.body_he : c.body_en}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteCanned(c.id)}
                      className="shrink-0 p-1.5 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t border-edge">
              <p className="text-xs font-semibold text-ink-muted">{t('settings.addCanned')}</p>
              <input
                className="w-full h-12 rounded-xl border border-edge bg-surface-elevated px-4 text-sm text-ink outline-none placeholder:text-ink-subtle transition focus:border-agent focus:ring-1 focus:ring-agent/30"
                placeholder={t('settings.shortcutPlaceholder')}
                value={newShortcut}
                onChange={e => setNewShortcut(e.target.value)}
              />
              <input
                className="w-full h-12 rounded-xl border border-edge bg-surface-elevated px-4 text-sm text-ink outline-none placeholder:text-ink-subtle transition focus:border-agent focus:ring-1 focus:ring-agent/30"
                placeholder={t('settings.bodyHe')}
                value={newBodyHe}
                onChange={e => setNewBodyHe(e.target.value)}
              />
              <input
                className="w-full h-12 rounded-xl border border-edge bg-surface-elevated px-4 text-sm text-ink outline-none placeholder:text-ink-subtle transition focus:border-agent focus:ring-1 focus:ring-agent/30"
                placeholder={t('settings.bodyEn')}
                value={newBodyEn}
                onChange={e => setNewBodyEn(e.target.value)}
              />
              <button
                onClick={handleAddCanned}
                disabled={addingCanned || !newShortcut || !newBodyHe || !newBodyEn}
                className="btn-primary w-fit h-12"
              >
                <Plus className="h-4 w-4" />
                {t('settings.addCanned')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
