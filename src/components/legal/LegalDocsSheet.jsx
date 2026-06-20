import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, Shield, ChevronRight, ScrollText } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

// One tappable option inside the legal-docs picker. Mirrors the LinkRow look
// used on the Profile/Settings cards so the sheet feels part of the same system.
function DocRow({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-2 py-3 min-h-[52px] text-start rounded-2xl
        transition-colors hover:bg-black/[0.03] active:bg-black/[0.05]
        dark:hover:bg-white/[0.06] dark:active:bg-white/10
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0 bg-primary-100 text-primary-700 dark:bg-accent-muted dark:text-accent">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <span className="flex-1 text-sm font-semibold text-ink">{label}</span>
      <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
    </button>
  )
}

// "Little window" that lets the user pick which legal document to open.
// Bottom sheet on mobile (rounded top, safe-area), centred on larger screens.
// Washer-terms only appears for washers (it's a gated viewer route).
export default function LegalDocsSheet({ open, onClose }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isWasher = profile?.role === 'washer'

  const go = (path) => () => { onClose(); navigate(path) }

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="bottom"
      icon={ScrollText}
      title={t('legal.links.section')}
      subtitle={t('legal.links.pickHint')}
    >
      <div className="flex flex-col gap-0.5 -mt-1">
        <DocRow icon={FileText} label={t('legal.links.terms')}   onClick={go('/legal/terms')} />
        {isWasher && (
          <DocRow icon={FileText} label={t('legal.links.washerTerms')} onClick={go('/legal/washer-terms')} />
        )}
        <DocRow icon={Shield} label={t('legal.links.privacy')} onClick={go('/legal/privacy')} />
      </div>
    </Modal>
  )
}
