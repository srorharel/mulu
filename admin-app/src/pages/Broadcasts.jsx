import { useTranslation } from 'react-i18next'
import { Megaphone } from 'lucide-react'

// Stub until P4 — broadcast composer + history lives here.

export default function Broadcasts() {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
      <Megaphone size={36} className="text-ink-subtle" />
      <h2 className="text-lg font-bold text-ink">{t('dashboard.tabs.broadcasts')}</h2>
      <p className="text-sm text-ink-muted max-w-sm">{t('dashboard.empty.subtitle')}</p>
    </div>
  )
}
