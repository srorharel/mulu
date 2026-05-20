import { useTranslation } from 'react-i18next'
import { useTheme } from '../../hooks/useTheme.js'

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer ${
        checked ? 'bg-accent' : 'bg-edge'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200 ease-in-out ${
          checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export default function AppearanceSection() {
  const { t } = useTranslation()
  const { isDark, setTheme } = useTheme()

  async function handleToggle(wantDark) {
    await setTheme(wantDark ? 'dark' : 'light')
  }

  return (
    <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-glass p-5 flex flex-col gap-3">
      <p className="text-sm font-semibold text-ink">{t('consumer.settings.appearance.title')}</p>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink flex-1 min-w-0 me-3">{t('consumer.settings.appearance.darkMode')}</p>
        <Toggle checked={isDark} onChange={handleToggle} />
      </div>
    </section>
  )
}
