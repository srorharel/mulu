import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'

// Regression: while a washer has an active job, nearby_jobs returns nothing, so
// the hook's local list is emptied. When the job ENDS (release/complete/cancel),
// the washer re-enters the pool — the Dashboard must refetch the FULL nearby list
// so it doesn't show only the single order that fired a realtime event (the bug:
// "after releasing, the nearby window shows only the job I released").

const refreshSpy = vi.fn()

vi.mock('../../../lib/supabase.js', () => {
  const makeBuilder = () => {
    const builder = {
      update: () => builder, select: () => builder, eq: () => builder,
      in: () => builder, gte: () => builder, order: () => builder,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null }),
    }
    return builder
  }
  return {
    supabase: {
      // get_washer_active_job → no server-side active job (activeJob comes from nav state)
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
    profile: { is_online: true, nav_app_preference: 'waze', full_name: 'W', current_tier: 1 },
    user: { id: 'u1' },
    refreshProfile: () => {},
  }),
}))
vi.mock('../../../hooks/useGeolocation.js', () => ({
  useGeolocation: () => ({ position: { lat: 32.05, lng: 34.8 }, permissionState: 'granted', requestPermission: () => {} }),
}))
vi.mock('../../../hooks/useTheme.js', () => ({ useTheme: () => ({ isDark: false }) }))
vi.mock('../../../components/ui/Toast.jsx', () => ({ useToast: () => vi.fn() }))
// The unit under test: the hook exposes `refresh`; assert the Dashboard calls it.
vi.mock('../../../hooks/useNearbyJobs.js', () => ({
  useNearbyJobs: () => ({ jobs: [], loading: false, refresh: refreshSpy }),
}))
// JobDrawer stub exposing the active state + a button that ends the job (onJobDone).
vi.mock('../../../components/washer/JobDrawer.jsx', () => ({
  default: ({ onJobDone, activeJob }) => (
    <button data-testid="job" onClick={onJobDone}>{activeJob ? 'active' : 'idle'}</button>
  ),
  getSnaps: () => ({ expandedH: 600, expanded: 0, default: 300, collapsed: 480 }),
}))
vi.mock('../../../components/washer/RecenterButton.jsx', () => ({ default: () => null }))
vi.mock('../../../components/washer/WasherMenu.jsx', () => ({ default: () => null }))
vi.mock('../../../components/washer/NavLauncher.jsx', () => ({ default: () => null }))
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
      <MemoryRouter initialEntries={[{ pathname: '/washer', state: { acceptedJob: { id: 'j1', lat: 32.05, lng: 34.8 } } }]}>
        <WasherDashboard />
      </MemoryRouter>
    </I18nextProvider>
  )
}

describe('WasherDashboard — refetch nearby jobs when the active job ends', () => {
  beforeEach(() => refreshSpy.mockReset())

  it('does NOT refetch on mount (entering an active job), but DOES when the job ends', async () => {
    renderDashboard()

    // Active job applied from nav state — no refetch yet (entering a job, not leaving).
    await waitFor(() => expect(screen.getByTestId('job').textContent).toBe('active'))
    expect(refreshSpy).not.toHaveBeenCalled()

    // End the job (release/complete/cancel all funnel through onJobDone → activeJob=null).
    fireEvent.click(screen.getByTestId('job'))

    await waitFor(() => expect(screen.getByTestId('job').textContent).toBe('idle'))
    expect(refreshSpy).toHaveBeenCalledTimes(1)
  })
})
