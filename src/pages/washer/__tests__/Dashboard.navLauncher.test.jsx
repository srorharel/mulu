import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'

// ── Mocks: keep the Dashboard render network-free; NavLauncher stays REAL ──────
vi.mock('../../../lib/supabase.js', () => {
  // Chainable, awaitable query-builder stub: every filter returns the builder,
  // terminal helpers (single/maybeSingle) resolve, and `await builder` resolves
  // to an empty list (covers useTodayEarnings' .select().eq().eq().gte()).
  const makeBuilder = () => {
    const builder = {
      update: () => builder,
      select: () => builder,
      eq:     () => builder,
      in:     () => builder,
      gte:    () => builder,
      order:  () => builder,
      single:      () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null }),
    }
    return builder
  }
  return {
    supabase: {
      rpc: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      from: () => makeBuilder(),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
    },
    isSupabaseConfigured: true,
  }
})
vi.mock('../../../lib/offlineSync/engine.js', () => ({ replayAll: () => Promise.resolve() }))
vi.mock('../../../lib/offlineSync/connectivity.js', () => ({ subscribeOnline: () => () => {} }))
vi.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: () => ({
    profile: { is_online: false, nav_app_preference: 'waze', full_name: 'W', current_tier: 1 },
    user: { id: 'u1' },
    refreshProfile: () => {},
  }),
}))
vi.mock('../../../hooks/useGeolocation.js', () => ({
  useGeolocation: () => ({ position: null, permissionState: 'granted', requestPermission: () => {} }),
}))
vi.mock('../../../hooks/useTheme.js', () => ({ useTheme: () => ({ isDark: false }) }))
vi.mock('../../../components/ui/Toast.jsx', () => ({ useToast: () => vi.fn(), ToastProvider: ({ children }) => children }))
vi.mock('../../../hooks/useNearbyJobs.js', () => ({ useNearbyJobs: () => ({ jobs: [], loading: false }) }))
vi.mock('../../../components/washer/JobDrawer.jsx', () => ({
  default: () => null,
  getSnaps: () => ({ expandedH: 600, expanded: 0, default: 300, collapsed: 480 }),
}))
vi.mock('../../../components/washer/RecenterButton.jsx', () => ({ default: () => null }))
vi.mock('../../../components/washer/WasherMenu.jsx', () => ({ default: () => null }))
vi.mock('../../../components/ui/MapBG.jsx', () => ({ default: () => null }))
vi.mock('../../../components/washer/WorkerMap.jsx', () => ({ default: () => null }))
vi.mock('../../../components/editable/Editable.jsx', () => ({ default: ({ children }) => children }))

import WasherDashboard from '../Dashboard.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
})

function renderDashboard() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[{ pathname: '/washer', state: { acceptedJob: { id: 'j1', lat: 32.05, lng: 34.80 } } }]}>
        <WasherDashboard />
      </MemoryRouter>
    </I18nextProvider>
  )
}

describe('Dashboard top-chrome — Waze launcher under the earnings square', () => {
  it('anchors the Waze launcher in the top overlay, after (below) the today-earnings element', () => {
    renderDashboard()

    const today = screen.getByText(en.washer.dashboard.today) // earnings square label
    const waze  = screen.getByRole('link', { name: 'Open in Waze' })

    // Both live inside the same fixed top-chrome overlay container.
    const overlay = waze.closest('.fixed')
    expect(overlay).toBeTruthy()
    expect(overlay.contains(today)).toBe(true)

    // Earnings square comes before (above) the Waze launcher in the DOM.
    const followsEarnings = Boolean(today.compareDocumentPosition(waze) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(followsEarnings).toBe(true)
  })
})
