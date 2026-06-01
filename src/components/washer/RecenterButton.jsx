import { motion, useTransform, useMotionValue } from 'framer-motion'
import { LocateFixed } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Floating "recenter on me" map control for the washer dashboard.
//
// Anchored to the map's physical-left edge and glued to the JobDrawer's top
// edge: its `bottom` tracks the *shared* drawer motion value in real time, so it
// rides up/down with the sheet — including mid-drag — with no per-frame React
// re-render (Framer drives the style off the MotionValue directly).
//
// map control: fixed physical-left, does not flip with locale
// (intentional exception to the logical-property RTL rule — same rationale as
//  WorkerMap's dir="ltr").
//
// Bottom offset composes with the existing CSS vars (DESIGN.md §11): the drawer's
// top edge sits at  var(--nav-height) + (expandedH - y)  above the screen bottom
// (--nav-height already carries env(safe-area-inset-bottom) on washer routes),
// and the button clears it by var(--stack-gap, 12px).
export default function RecenterButton({ drawerY, expandedH = 0, visible = true, onRecenter }) {
  const { t }    = useTranslation()
  const fallback = useMotionValue(0)
  const source   = drawerY ?? fallback
  const bottom   = useTransform(source, y =>
    `calc(var(--nav-height, 0px) + var(--stack-gap, 12px) + ${Math.max(0, expandedH - y)}px)`,
  )

  if (!visible) return null

  return (
    <motion.button
      type="button"
      data-testid="recenter-btn"
      onClick={onRecenter}
      aria-label={t('washer.dashboard.recenterMap')}
      className="fixed z-20 flex items-center justify-center rounded-2xl bg-glass border border-glass-border backdrop-blur-xl shadow-lg transition-transform active:scale-90"
      style={{ bottom, left: '1rem', width: 44, height: 44, touchAction: 'manipulation' }}
    >
      <LocateFixed className="h-5 w-5 text-ink" />
    </motion.button>
  )
}
