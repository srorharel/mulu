import { lazy, Suspense } from 'react'
import { DownloadProvider } from './components/download-context.jsx'
import { DownloadModal } from './components/DownloadModal.jsx'
import { BubblesBackground } from './components/BubblesBackground.jsx'
import { AccessibilityMenu } from './components/AccessibilityMenu.jsx'
import { Nav } from './sections/Nav.jsx'
import { Hero } from './sections/Hero.jsx'
import { HowItWorks } from './sections/HowItWorks.jsx'
import { WhyTrust } from './sections/WhyTrust.jsx'
import { Services } from './sections/Services.jsx'
import { ForWashers } from './sections/ForWashers.jsx'
import { Timeline } from './sections/Timeline.jsx'
import { FinalCTA } from './sections/FinalCTA.jsx'
import { Footer } from './sections/Footer.jsx'

// Secondary pages are code-split so the marketing landing stays lean. AuthConfirm
// in particular pulls in @supabase/supabase-js, which the homepage must not load.
const AccessibilityStatement = lazy(() => import('./pages/AccessibilityStatement.jsx').then((m) => ({ default: m.AccessibilityStatement })))
const LegalPage = lazy(() => import('./pages/LegalPage.jsx').then((m) => ({ default: m.LegalPage })))
const AccountDeletionInfo = lazy(() => import('./pages/AccountDeletionInfo.jsx').then((m) => ({ default: m.AccountDeletionInfo })))
const AuthConfirm = lazy(() => import('./pages/AuthConfirm.jsx').then((m) => ({ default: m.AuthConfirm })))

// SPA routing is handled by the Cloudflare Worker's single-page-application
// not-found fallback (wrangler.toml): any unknown path serves index.html, and we
// branch on the pathname here. Keeps the marketing page a flat SPA while giving
// the legal / accessibility / deletion / auth pages their own URLs.
function currentRoute() {
  if (typeof window === 'undefined') return null
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path === '/accessibility') return <AccessibilityStatement />
  if (path === '/legal/privacy') return <LegalPage docKey="privacy" />
  if (path === '/legal/terms') return <LegalPage docKey="terms" />
  if (path === '/account/delete') return <AccountDeletionInfo />
  if (path === '/auth/confirm') return <AuthConfirm />
  return null
}

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-wash">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

export default function App() {
  const route = currentRoute()

  return (
    <DownloadProvider>
      <a href="#main" className="skip-link">דלג לתוכן הראשי</a>

      {/* #mulu-content is the target for the accessibility menu's visual filter
          modes (contrast / invert / grayscale). The menu lives OUTSIDE it so it
          stays usable while a filter is active. */}
      <div id="mulu-content">
        {route ? (
          <Suspense fallback={<RouteFallback />}>{route}</Suspense>
        ) : (
          <>
            <BubblesBackground />
            <Nav />
            <main id="main">
              <Hero />
              <HowItWorks />
              <WhyTrust />
              <Services />
              <ForWashers />
              <Timeline />
              <FinalCTA />
            </main>
            <Footer />
            <DownloadModal />
          </>
        )}
      </div>

      <AccessibilityMenu />
    </DownloadProvider>
  )
}
