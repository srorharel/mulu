import { useState, useEffect } from 'react'
import { motion, LayoutGroup } from 'framer-motion'
import PageShell from '../../components/ui/PageShell.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../../components/ui/Toast.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

const RINGTONE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'chime',   label: 'Chime'   },
  { value: 'bell',    label: 'Bell'    },
  { value: 'silent',  label: 'Silent'  },
]

const DISPLAY_OPTIONS = [
  { value: 'dark',  label: 'Dark'  },
  { value: 'light', label: 'Light' },
]

const NAV_OPTIONS = [
  { value: 'waze',   label: 'Waze'         },
  { value: 'google', label: 'Google Maps'  },
]

// Horizontal pill selector (for 2-option settings)
function PillRow({ groupId, options, value, onChange }) {
  return (
    <LayoutGroup id={groupId}>
      <div className="flex rounded-xl overflow-hidden border border-edge bg-surface">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="relative flex-1 py-2.5 text-sm font-medium transition-colors"
          >
            {value === opt.value && (
              <motion.div
                layoutId={`${groupId}-pill`}
                className="absolute inset-0 bg-accent-muted"
                transition={SPRING}
              />
            )}
            <span className={`relative z-10 ${value === opt.value ? 'text-accent' : 'text-ink-muted'}`}>
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}

// 2×2 grid pill selector (for 4-option ringtone setting)
function GridPill({ groupId, options, value, onChange }) {
  return (
    <LayoutGroup id={groupId}>
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="relative rounded-xl py-2.5 px-3 text-sm font-medium border border-edge bg-surface transition-colors overflow-hidden"
          >
            {value === opt.value && (
              <motion.div
                layoutId={`${groupId}-pill`}
                className="absolute inset-0 bg-accent-muted"
                transition={SPRING}
              />
            )}
            <span className={`relative z-10 ${value === opt.value ? 'text-accent' : 'text-ink-muted'}`}>
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}

export default function Settings() {
  const { profile, user, refreshProfile } = useAuth()
  const showToast = useToast()

  const [prefs, setPrefs] = useState({
    ringtone: 'default',
    display:  'dark',
    nav:      'waze',
  })

  // Sync from profile once it loads
  useEffect(() => {
    if (!profile) return
    setPrefs({
      ringtone: profile.ringtone_preference ?? 'default',
      display:  profile.display_preference  ?? 'dark',
      nav:      profile.nav_app_preference   ?? 'waze',
    })
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(column, value) {
    // Optimistic update — UI moves instantly
    setPrefs(p => ({ ...p, [column]: value }))
    const { error } = await supabase
      .from('profiles')
      .update({ [`${column}_preference`]: value })
      .eq('id', user.id)
    if (error) {
      showToast(error.message, 'error')
      return
    }
    // Propagate to AuthContext so WasherShell picks up display change immediately
    await refreshProfile()
  }

  return (
    <PageShell>
      <div className="px-4 pt-6 pb-8 flex flex-col gap-6">
        <h1 className="text-xl font-bold text-ink">Settings</h1>

        {/* ── 1. Ringtone ───────────────────────────────────────────── */}
        <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-5 flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">New job notification sound</p>
          </div>
          <GridPill
            groupId="ringtone"
            options={RINGTONE_OPTIONS}
            value={prefs.ringtone}
            onChange={v => save('ringtone', v)}
          />
          <p className="text-xs text-ink-muted/70">Sound preview and live notifications coming soon.</p>
        </section>

        {/* ── 2. Display ────────────────────────────────────────────── */}
        <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-5 flex flex-col gap-3">
          <p className="text-sm font-semibold text-ink">Appearance</p>
          <PillRow
            groupId="display"
            options={DISPLAY_OPTIONS}
            value={prefs.display}
            onChange={v => save('display', v)}
          />
        </section>

        {/* ── 3. Navigation ─────────────────────────────────────────── */}
        <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-5 flex flex-col gap-3">
          <p className="text-sm font-semibold text-ink">Navigation app</p>
          <PillRow
            groupId="nav"
            options={NAV_OPTIONS}
            value={prefs.nav}
            onChange={v => save('nav', v)}
          />
        </section>
      </div>
    </PageShell>
  )
}
