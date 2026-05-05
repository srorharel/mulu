// Reusable glass surface card.
// Works in both LTR (consumer) and RTL (washer Phase E) contexts — no directional styles.
// Accepts `as` for polymorphic rendering: <GlassCard as={Link} to="/somewhere" />
export default function GlassCard({ children, className = '', as: Tag = 'div', ...props }) {
  return (
    <Tag
      className={`bg-glass border border-glass-border backdrop-blur-xl rounded-2xl shadow-lg shadow-black/5 ${className}`}
      {...props}
    >
      {children}
    </Tag>
  )
}
