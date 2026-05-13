import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { setAgentActive } from '../lib/support.js'
import { useAuth } from '../context/AuthContext.jsx'

const SPRING = { type: 'spring', stiffness: 500, damping: 40 }

export default function AgentStatusToggle() {
  const { t } = useTranslation()
  const { profile, refreshProfile } = useAuth()
  const [toggling, setToggling] = useState(false)
  const active = profile?.agent_is_active ?? false

  async function toggle() {
    if (toggling) return
    setToggling(true)
    await setAgentActive(profile.id, !active)
    await refreshProfile()
    setToggling(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={toggling}
      className="flex items-center gap-2 text-sm"
    >
      <span className={`text-xs font-medium ${active ? 'text-accent' : 'text-ink-muted'}`}>
        {active ? t('status.active') : t('status.away')}
      </span>
      <motion.div
        className="relative w-9 h-5 rounded-full border"
        animate={{
          backgroundColor: active ? 'rgba(125,217,162,0.20)' : 'rgba(255,255,255,0.06)',
          borderColor:     active ? 'rgba(125,217,162,0.45)' : 'rgba(255,255,255,0.12)',
        }}
        transition={SPRING}
      >
        <motion.div
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow-md"
          animate={{
            x:               active ? 16 : 0,
            backgroundColor: active ? 'rgb(71,209,127)' : 'rgb(115,115,115)',
          }}
          transition={SPRING}
        />
      </motion.div>
    </button>
  )
}
