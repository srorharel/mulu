import { useAdminBackground } from '../context/BackgroundContext.jsx'

// Fixed, full-viewport background layer that sits BEHIND the admin shell.
//
// The image renders at the admin's stored opacity (≤ 0.5) over the solid surface
// base, so the console's own solid card/panel surfaces keep tables and forms
// legible over any image. Personal + private: `imageUrl` is a short-lived signed
// URL for the caller's own object (migration 0102).
//
// Falls back to the plain off-white surface when the admin has no image, has it
// disabled, the signed URL hasn't resolved, or no provider is mounted.
export default function AdminBackground() {
  const bg = useAdminBackground()
  const show = !!(bg && bg.enabled && bg.imageUrl)

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      {/* Solid base so empty gaps read as the normal off-white console surface. */}
      <div className="absolute inset-0 bg-surface" />
      {show && (
        <div
          data-testid="admin-bg-image"
          className="absolute inset-0 bg-center bg-cover bg-no-repeat"
          style={{ backgroundImage: `url("${bg.imageUrl}")`, opacity: bg.opacity }}
        />
      )}
    </div>
  )
}
