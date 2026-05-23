const STYLES = {
  agent:   'bg-agent/16 text-agent border-agent/30',
  accent:  'bg-accent/16 text-accent border-accent/30',
  warning: 'bg-warning/16 text-warning border-warning/30',
  danger:  'bg-danger/16 text-danger border-danger/30',
  success: 'bg-success/16 text-success border-success/30',
  subtle:  'bg-surface-high text-ink-subtle border-edge',
}

export default function Pill({ children, color = 'subtle', dot = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold leading-none ${STYLES[color] ?? STYLES.subtle} ${className}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
      {children}
    </span>
  )
}
