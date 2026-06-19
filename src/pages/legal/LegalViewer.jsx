import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PageShell from '../../components/ui/PageShell.jsx'
import { supabase } from '../../lib/supabase.js'
import { useLocale } from '../../hooks/useLocale.js'
import Markdown from '../../components/legal/Markdown.jsx'

// Read-only on-demand viewer for a single legal doc type. Fetches the current
// published version for the user's locale (he-fallback handled server-side by
// get_current_legal_document). Mounted at /legal/terms, /legal/privacy,
// /legal/washer-terms.
export default function LegalViewer({ docType }) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { locale } = useLocale()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setNotFound(false)
    supabase
      .rpc('get_current_legal_document', { p_doc_type: docType, p_locale: locale })
      .then(({ data, error }) => {
        if (!active) return
        const row = Array.isArray(data) ? data[0] : data
        if (error || !row) setNotFound(true)
        else setDoc(row)
        setLoading(false)
      })
    return () => { active = false }
  }, [docType, locale])

  const dir = i18n.language === 'he' ? 'rtl' : 'ltr'

  return (
    <PageShell>
      <div className="bg-mesh min-h-full flex flex-col" dir={dir}>
        <div className="px-5 pt-4 pb-2 flex items-center gap-3 shrink-0">
          <button
            onClick={() => navigate(-1)}
            aria-label={t('common.back')}
            className="w-10 h-10 rounded-[14px] bg-glass backdrop-blur-xl border border-glass-border flex items-center justify-center text-ink shadow-sm"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <h1 className="text-[22px] font-extrabold text-ink tracking-[-0.5px]">
            {doc?.title || t(`legal.viewer.${docType}`)}
          </h1>
        </div>

        <div className="flex-1 px-5 pb-10 pt-2">
          {loading ? (
            <p className="text-sm text-ink-muted">{t('common.loading')}</p>
          ) : notFound ? (
            <p className="text-sm text-ink-muted">{t('legal.viewer.notFound')}</p>
          ) : (
            <Markdown content={doc.content} />
          )}
        </div>
      </div>
    </PageShell>
  )
}
