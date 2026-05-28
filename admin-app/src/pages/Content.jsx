import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'

// Stub until P2 — namespace tree browser + override editor lives here.

export default function Content() {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
      <FileText size={36} className="text-ink-subtle" />
      <h2 className="text-lg font-bold text-ink">{t('dashboard.tabs.content')}</h2>
      <p className="text-sm text-ink-muted max-w-sm">{t('dashboard.empty.subtitle')}</p>
    </div>
  )
}
