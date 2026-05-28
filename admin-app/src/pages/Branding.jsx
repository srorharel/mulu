import { useTranslation } from 'react-i18next'
import { Image } from 'lucide-react'

// Stub until P3 — asset slug list + upload widget lives here.

export default function Branding() {
  const { t } = useTranslation()
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
      <Image size={36} className="text-ink-subtle" />
      <h2 className="text-lg font-bold text-ink">{t('dashboard.tabs.branding')}</h2>
      <p className="text-sm text-ink-muted max-w-sm">{t('dashboard.empty.subtitle')}</p>
    </div>
  )
}
