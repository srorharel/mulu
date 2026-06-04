import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase.js'
import { fetchReports, setReportStatus } from '../lib/moderation.js'

// Literal class names (Tailwind JIT scans source for these — no dynamic strings).
const STATUS_BADGE = { open: 'bg-danger', reviewed: 'bg-warning', actioned: 'bg-success' }

export default function ReportsView() {
  const { t, i18n } = useTranslation()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await fetchReports()
    setReports(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!supabase) return
    const ch = supabase
      .channel('reports-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_reports' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  async function update(id, status) {
    await setReportStatus(id, status)
    load()
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <h2 className="text-lg font-bold text-ink mb-4">{t('reports.title')}</h2>
      {loading ? (
        <p className="text-sm text-ink-muted">{t('common.loading')}</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('reports.empty')}</p>
      ) : (
        <div className="flex flex-col gap-2 max-w-3xl">
          {reports.map(r => (
            <div key={r.id} className="card flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full text-white ${STATUS_BADGE[r.status] || 'bg-danger'}`}>
                  {t(`reports.statusLabel.${r.status}`)}
                </span>
                <span className="text-xs text-ink-muted">{t(`reports.context.${r.context}`)}</span>
                <span className="text-xs text-ink-subtle ms-auto">
                  {new Date(r.created_at).toLocaleString(i18n.language === 'he' ? 'he-IL' : 'en-US')}
                </span>
              </div>
              <p className="text-sm text-ink">
                {t('reports.reportedUser')}: <span className="font-mono text-xs">{r.reported_user_id}</span>
              </p>
              {r.reason && <p className="text-sm text-ink-muted">{r.reason}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => update(r.id, 'reviewed')}
                  disabled={r.status === 'reviewed'}
                  className="px-3 h-9 rounded-lg border border-edge text-xs font-semibold text-ink disabled:opacity-40"
                >
                  {t('reports.markReviewed')}
                </button>
                <button
                  onClick={() => update(r.id, 'actioned')}
                  disabled={r.status === 'actioned'}
                  className="px-3 h-9 rounded-lg bg-agent text-white text-xs font-semibold disabled:opacity-40"
                >
                  {t('reports.markActioned')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
