import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Car, CreditCard, FileText, Shield, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { FEATURES } from '../../lib/featureFlags.js'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'
import NotificationsSection from '../../components/settings/NotificationsSection.jsx'
import AppearanceSection from '../../components/settings/AppearanceSection.jsx'
import PillRow from '../../components/settings/PillRow.jsx'
import { useLocale } from '../../hooks/useLocale.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Editable from '../../components/editable/Editable.jsx'
import DeleteAccountModal from '../../components/account/DeleteAccountModal.jsx'

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'he', label: 'עברית'   },
]

export default function ConsumerSettings() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { locale, setLocale } = useLocale()
  const showToast = useToast()
  const [showDelete, setShowDelete] = useState(false)

  return (
    <PageShell>
      <div className="bg-mesh min-h-full flex flex-col">
        <div className="px-5 pt-4 pb-2 flex items-center gap-3 shrink-0">
          <button
            onClick={() => navigate(-1)}
            aria-label={t('common.back')}
            className="w-10 h-10 rounded-[14px] bg-glass backdrop-blur-xl border border-glass-border flex items-center justify-center text-ink shadow-sm"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <h1 className="text-[22px] font-extrabold text-ink tracking-[-0.5px]">
            {t('consumer.settings.title')}
          </h1>
        </div>

        <div className="flex-1 px-4 pb-8 flex flex-col gap-3 pt-2">
          <NotificationsSection />

          <AppearanceSection />

          <Editable id="consumer.settings.section">
          <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-glass p-5 flex flex-col gap-3">
            <p className="text-sm font-semibold text-ink">{t('settings.language.label')}</p>
            <p className="text-sm text-ink-muted">{t('settings.language.helper')}</p>
            <PillRow
              groupId="consumer-language"
              options={LANGUAGE_OPTIONS}
              value={locale}
              onChange={async (lang) => {
                const { error } = await setLocale(lang)
                if (error) showToast(error.message, 'error')
                else showToast(t('toasts.languageChanged'))
              }}
            />
          </section>
          </Editable>

          <GlassCard className="p-0 overflow-hidden">
            <button
              onClick={() => navigate('/profile/vehicles')}
              className="w-full flex items-center gap-3 px-4 py-4 text-start"
            >
              <div className="w-9 h-9 rounded-[11px] bg-primary-100 flex items-center justify-center shrink-0">
                <Car className="h-[18px] w-[18px] text-primary-700" />
              </div>
              <span className="flex-1 text-sm font-semibold text-ink">
                {t('profile.vehicles')}
              </span>
              <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
            </button>
          </GlassCard>

          {/* Payment methods — only when payments are enabled */}
          {FEATURES.payments && (
            <GlassCard className="p-0 overflow-hidden">
              <button
                onClick={() => navigate('/profile/payment-methods')}
                className="w-full flex items-center gap-3 px-4 py-4 text-start"
              >
                <div className="w-9 h-9 rounded-[11px] bg-primary-100 flex items-center justify-center shrink-0">
                  <CreditCard className="h-[18px] w-[18px] text-primary-700" />
                </div>
                <span className="flex-1 text-sm font-semibold text-ink">
                  {t('consumer.payment.title')}
                </span>
                <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
              </button>
            </GlassCard>
          )}

          {/* Legal documents */}
          <GlassCard className="p-0 overflow-hidden">
            <button
              onClick={() => navigate('/legal/terms')}
              className="w-full flex items-center gap-3 px-4 py-4 text-start border-b border-glass-border"
            >
              <div className="w-9 h-9 rounded-[11px] bg-primary-100 flex items-center justify-center shrink-0">
                <FileText className="h-[18px] w-[18px] text-primary-700" />
              </div>
              <span className="flex-1 text-sm font-semibold text-ink">{t('legal.links.terms')}</span>
              <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
            </button>
            <button
              onClick={() => navigate('/legal/privacy')}
              className="w-full flex items-center gap-3 px-4 py-4 text-start"
            >
              <div className="w-9 h-9 rounded-[11px] bg-primary-100 flex items-center justify-center shrink-0">
                <Shield className="h-[18px] w-[18px] text-primary-700" />
              </div>
              <span className="flex-1 text-sm font-semibold text-ink">{t('legal.links.privacy')}</span>
              <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
            </button>
          </GlassCard>

          {/* Danger zone — account deletion */}
          <GlassCard className="p-0 overflow-hidden">
            <button
              onClick={() => setShowDelete(true)}
              className="w-full flex items-center gap-3 px-4 py-4 text-start"
            >
              <div className="w-9 h-9 rounded-[11px] bg-danger-50 flex items-center justify-center shrink-0">
                <Trash2 className="h-[18px] w-[18px] text-danger-500" />
              </div>
              <span className="flex-1 text-sm font-semibold text-danger-500">{t('account.delete.title')}</span>
              <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
            </button>
          </GlassCard>
        </div>

        {showDelete && <DeleteAccountModal onClose={() => setShowDelete(false)} />}
      </div>
    </PageShell>
  )
}
