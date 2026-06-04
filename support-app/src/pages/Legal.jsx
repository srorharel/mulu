import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import LeftRail from '../components/LeftRail.jsx'
import MobileTabBar from '../components/MobileTabBar.jsx'
import Markdown from '../components/Markdown.jsx'

const DOC_TYPES = ['consumer_terms', 'privacy_policy', 'washer_terms']
const LOCALES = ['he', 'en']

export default function Legal() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()

  const isAgent = profile?.role === 'agent'

  const [docType, setDocType]             = useState('consumer_terms')
  const [locale, setLocale]               = useState('he')
  const [title, setTitle]                 = useState('')
  const [content, setContent]             = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [history, setHistory]             = useState([])
  const [loading, setLoading]             = useState(false)
  const [publishing, setPublishing]       = useState(false)
  const [confirmOpen, setConfirmOpen]     = useState(false)
  const [error, setError]                 = useState('')
  const [okMsg, setOkMsg]                 = useState('')

  const loadHistory = useCallback(async () => {
    if (!isAgent) return
    setLoading(true)
    const { data } = await supabase
      .from('legal_documents')
      .select('id, version, title, content, is_current, effective_date, published_at')
      .eq('doc_type', docType)
      .eq('locale', locale)
      .order('version', { ascending: false })
    const rows = data ?? []
    setHistory(rows)
    const current = rows.find(r => r.is_current)
    if (current) {
      setTitle(current.title)
      setContent(current.content)
      setEffectiveDate(current.effective_date ?? '')
    } else {
      setTitle('')
      setContent('')
      setEffectiveDate('')
    }
    setLoading(false)
  }, [docType, locale, isAgent])

  useEffect(() => { loadHistory() }, [loadHistory])

  // Realtime: a publish from anywhere refreshes the history list.
  useEffect(() => {
    if (!isAgent || !supabase) return
    const ch = supabase
      .channel('legal_documents_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'legal_documents' }, () => loadHistory())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [isAgent, loadHistory])

  async function doPublish() {
    setConfirmOpen(false)
    setPublishing(true)
    setError('')
    setOkMsg('')
    const { data, error: err } = await supabase.rpc('publish_legal_document', {
      p_doc_type: docType,
      p_locale: locale,
      p_title: title,
      p_content: content,
      p_effective_date: effectiveDate || null,
    })
    setPublishing(false)
    if (err) { setError(err.message); return }
    const v = Array.isArray(data) ? data[0]?.version : data?.version
    setOkMsg(t('legal.published', { version: v ?? '' }))
    loadHistory()
  }

  const canPublish = !!title.trim() && !!content.trim() && !publishing

  if (!isAgent) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface px-6 text-center">
        <p className="text-sm text-ink-muted">{t('legal.agentsOnly')}</p>
      </div>
    )
  }

  const dir = i18n.language === 'he' ? 'rtl' : 'ltr'

  return (
    <div className="flex flex-col md:flex-row h-screen bg-surface overflow-hidden">
      <LeftRail
        activeTab="legal"
        onTabChange={(tab) => navigate(tab === 'conv' ? '/' : `/${tab}`)}
        profile={profile}
        onSettings={() => navigate('/settings')}
        onSignOut={signOut}
      />

      <div className="flex-1 overflow-y-auto" dir={dir}>
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="md:hidden p-1.5 -ms-1 rounded-lg text-ink-muted hover:text-ink transition-colors"
              aria-label={t('common.back')}
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl md:text-[24px] font-extrabold text-ink" style={{ letterSpacing: '-0.5px' }}>
              {t('legal.title')}
            </h1>
          </div>

          {/* Selectors */}
          <div className="card flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('legal.docType')}</label>
              <div className="flex flex-wrap gap-2">
                {DOC_TYPES.map(dt => (
                  <button
                    key={dt}
                    type="button"
                    onClick={() => setDocType(dt)}
                    className={`px-4 h-10 rounded-xl text-sm font-semibold transition ${
                      docType === dt ? 'bg-agent text-white' : 'bg-surface-elevated text-ink border border-edge'
                    }`}
                  >
                    {t(`legal.docTypes.${dt}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('legal.locale')}</label>
              <div className="flex gap-2">
                {LOCALES.map(lc => (
                  <button
                    key={lc}
                    type="button"
                    onClick={() => setLocale(lc)}
                    className={`px-4 h-10 rounded-xl text-sm font-semibold transition ${
                      locale === lc ? 'bg-agent text-white' : 'bg-surface-elevated text-ink border border-edge'
                    }`}
                  >
                    {t(`legal.locales.${lc}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Editor + live preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card flex flex-col gap-3">
              <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('legal.editor')}</label>
              <input
                className="w-full h-12 rounded-xl border border-edge bg-surface-elevated px-4 text-sm text-ink outline-none focus:border-agent focus:ring-1 focus:ring-agent/30"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('legal.titlePlaceholder')}
                aria-label={t('legal.titleLabel')}
                dir="rtl"
              />
              <textarea
                className="w-full min-h-[340px] rounded-xl border border-edge bg-surface-elevated px-4 py-3 text-sm text-ink outline-none focus:border-agent focus:ring-1 focus:ring-agent/30 font-mono leading-relaxed"
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder={t('legal.contentPlaceholder')}
                aria-label={t('legal.contentLabel')}
                dir="rtl"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-ink-muted">{t('legal.effectiveDate')}</label>
                <input
                  type="date"
                  value={effectiveDate ?? ''}
                  onChange={e => setEffectiveDate(e.target.value)}
                  className="h-9 rounded-lg border border-edge bg-surface-elevated px-2 text-sm text-ink"
                />
              </div>
            </div>

            <div className="card flex flex-col gap-2">
              <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('legal.preview')}</label>
              <div className="rounded-xl border border-edge bg-surface-elevated p-4 overflow-y-auto max-h-[420px]" dir="rtl">
                {content.trim()
                  ? <Markdown content={content} />
                  : <p className="text-sm text-ink-subtle">{t('legal.previewEmpty')}</p>}
              </div>
            </div>
          </div>

          {/* Publish */}
          <div className="card flex flex-col gap-3">
            {error && <p className="text-sm text-danger">{error}</p>}
            {okMsg && <p className="text-sm text-success">{okMsg}</p>}
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={!canPublish}
              className="btn-primary w-fit h-12 disabled:opacity-50"
            >
              {publishing ? t('common.loading') : t('legal.publish')}
            </button>
            <p className="text-xs text-ink-subtle">{t('legal.publishHint')}</p>
          </div>

          {/* Version history */}
          <div className="card flex flex-col gap-3">
            <label className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('legal.history')}</label>
            {loading ? (
              <p className="text-sm text-ink-muted">{t('common.loading')}</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('legal.historyEmpty')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {history.map(h => (
                  <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-edge">
                    <span className="text-sm font-bold text-ink">v{h.version}</span>
                    {h.is_current && (
                      <span className="text-[10px] font-bold text-white bg-agent px-2 py-0.5 rounded-full">
                        {t('legal.current')}
                      </span>
                    )}
                    <span className="flex-1 text-sm text-ink truncate">{h.title}</span>
                    <span className="text-xs text-ink-subtle">
                      {h.published_at ? new Date(h.published_at).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US') : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <MobileTabBar
        activeTab="legal"
        onTabChange={(tab) => navigate(tab === 'conv' ? '/' : `/${tab}`)}
      />

      {/* Confirm dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="w-full max-w-sm bg-surface-elevated rounded-2xl shadow-2xl p-6 flex flex-col gap-4" dir={dir} role="dialog" aria-modal="true">
            <p className="text-base font-bold text-ink">{t('legal.confirmTitle')}</p>
            <p className="text-sm text-ink-muted">{t('legal.confirmBody')}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmOpen(false)} className="px-4 h-10 rounded-xl border border-edge text-sm font-semibold text-ink-muted">
                {t('common.cancel')}
              </button>
              <button onClick={doPublish} className="px-4 h-10 rounded-xl bg-agent text-white text-sm font-semibold">
                {t('legal.confirmPublish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
