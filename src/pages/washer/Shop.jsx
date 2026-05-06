import { ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PageShell from '../../components/ui/PageShell.jsx'

export default function Shop() {
  const { t } = useTranslation()
  return (
    <PageShell>
      <div className="px-4 pt-6 pb-6 flex flex-col h-full">
        <h1 className="text-xl font-bold text-ink mb-6">{t('washer.shop.title')}</h1>

        <div className="flex flex-1 items-center justify-center">
          <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-10 flex flex-col items-center gap-4 text-center w-full max-w-sm">
            <ShoppingBag className="h-14 w-14 text-ink-muted/40" />
            <div>
              <h2 className="text-lg font-bold text-ink">{t('washer.shop.comingSoon')}</h2>
              <p className="text-sm text-ink-muted mt-1.5 leading-relaxed">
                {t('washer.shop.comingSoonDesc')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
