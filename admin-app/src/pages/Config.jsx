import { useTranslation } from 'react-i18next'
import { SlidersHorizontal } from 'lucide-react'

// Stub until P5 — editable app_config knobs live here.

export default function Config() {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
      <SlidersHorizontal size={36} className="text-ink-subtle" />
      <h2 className="text-lg font-bold text-ink">{t('dashboard.tabs.config')}</h2>
      <p className="text-sm text-ink-muted max-w-sm">{t('dashboard.empty.subtitle')}</p>
    </div>
  )
}
