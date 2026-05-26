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

  function toggleLang() {
    const next = i18n.language === 'he' ? 'en' : 'he'
    i18n.changeLanguage(next)
    document.documentElement.dir = next === 'he' ? 'rtl' : 'ltr'
    document.documentElement.lang = next
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-surface overflow-hidden">
      <LeftRail
        activeTab="settings"
        onTabChange={(tab) => navigate(tab === 'conv' ? '/' : `/${tab}`)}
        profile={profile}
        onSettings={() => {}}
        onSignOut={signOut}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6">
          {/* Mobile back + title */}
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="md:hidden p-1.5 -ms-1 rounded-lg text-ink-muted hover:text-ink transition-colors" aria-label="Back">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl md:text-[24px] font-extrabold text-ink" style={{ letterSpacing: '-0.5px' }}>
              {t('settings.title')}
            </h1>
          </div>

          {/* Display name */}
          <div className="card flex flex-col gap-3">
            <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
              {t('settings.displayName')}
            </label>
            <input
              className="w-full h-12 rounded-xl border border-edge bg-surface-elevated px-4 text-sm text-ink outline-none placeholder:text-ink-subtle transition focus:border-agent focus:ring-1 focus:ring-agent/30"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your display name"
            />
            <div className="flex items-center gap-3">
              <button onClick={saveProfile} disabled={saving} className="btn-primary w-fit h-12">
                {saved ? t('settings.saved') : saving ? t('common.loading') : t('settings.save')}
              </button>
              {saveError && <p className="text-xs text-danger">{t('common.error')}</p>}
            </div>
          </div>

          {/* Language */}
          <div className="card flex items-center justify-between min-h-[48px]">
            <span className="text-sm text-ink">{t('settings.language')}</span>
            <button onClick={toggleLang} className="btn-ghost text-sm h-12 px-4">
              {i18n.language === 'he' ? 'English' : 'עברית'}
            </button>
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
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
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
                placeholder={t('settings.shortcut') + ' (e.g. /eta)'}
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
