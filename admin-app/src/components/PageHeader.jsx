// Shared sticky page header for every admin tab. Previously each page hand-rolled
// its own `<div className="border-b border-edge bg-surface-elevated …">` header,
// which drifted (Chats used py-3 while the rest used py-4, spacing varied, etc.).
// This unifies the chrome — icon + title, an optional right-aligned cluster
// (`right`: stats text and/or action buttons), and optional secondary rows
// (`children`: filter pills, search, inline errors). Page content/logic is
// unchanged — pages just pass their existing markup through these slots.
//
// Layout note: `right` and `children` render as direct flex children of the
// title row via a `ms-auto` spacer, so pages whose action buttons go full-width
// on mobile (e.g. Jobs "Create order") keep wrapping exactly as before.
//
// `dense` tightens the padding for headers that live inside a narrow pane
// rather than a full-width page (e.g. the Chats list rail).
export default function PageHeader({ icon: Icon, title, right, children, dense = false }) {
  const pad = dense ? 'px-4 py-3' : 'px-4 sm:px-6 py-4'
  return (
    <div className={`border-b border-edge bg-surface-elevated/95 backdrop-blur-sm sticky top-0 z-10 ${pad}`}>
      <div className={`flex items-center gap-2 flex-wrap ${children ? 'mb-3' : ''}`}>
        {Icon && <Icon size={18} className="text-admin-deep shrink-0" />}
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        {right != null && (
          <>
            <span className="ms-auto" aria-hidden="true" />
            {right}
          </>
        )}
      </div>
      {children}
    </div>
  )
}
