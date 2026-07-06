import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useMotionValue } from 'framer-motion'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'

// Regression (Jun 2026): for an UNDERGROUND order at `accepted`, tapping
// "Start trip" did nothing — advanceUnderground() had no en_route branch, so the
// accepted→en_route hop never reached the server and the washer was stuck on the
// accepted screen. The fix routes en_route through the normal server path: it
// happens above ground (reception OK), and the offline replay REQUIRES the
// server to reach en_route before arrival photos can sync (engine.js).

const rpcMock = vi.fn().mockResolvedValue({ error: null })

const ACCEPTED_UNDERGROUND = {
  id: 'ug-accepted-1',
  status: 'accepted',
  is_underground_parking: true,
  consumer_id: 'c1',
  base_price: 60,
  lat: 32.08, lng: 34.78,
  site_has_water: false, site_has_power: false,
}

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: vi.fn(),
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) },
  },
  isSupabaseConfigured: false,
}))

vi.mock('../../../hooks/useRealtimeOrder.js', () => ({
  useRealtimeOrder: () => ({ order: ACCEPTED_UNDERGROUND, loading: false, error: null, mutateOrder: vi.fn() }),
}))
vi.mock('../../../hooks/useOfflineSync.js', () => ({
  useOfflineSync: () => ({ online: true, syncing: false, pending: 0, hasError: false, runReplay: vi.fn() }),
}))
vi.mock('../../../lib/offlineSync/engine.js', () => ({
  putDraftAngle: vi.fn(), commitCapture: vi.fn(), getCapturesByOrder: vi.fn().mockResolvedValue([]),
  deleteCapturesByOrder: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../lib/geocode.js', () => ({
  useReverseGeocode: () => ({ address: '', loading: false }),
  looksLikeCoords: () => false, reverseGeocode: async () => null, forwardGeocode: async () => null,
}))
vi.mock('../../ui/Toast.jsx', () => ({ useToast: () => vi.fn(), ToastProvider: ({ children }) => children }))
vi.mock('../../editable/Editable.jsx', () => ({ default: ({ children }) => children }))
vi.mock('../../../hooks/useOrderUnreadCount.js', () => ({ useOrderUnreadCount: () => 0 }))
vi.mock('../../chat/OrderChatSheet.jsx', () => ({ default: () => null }))

import JobDrawer, { getSnaps } from '../JobDrawer.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
})

function renderDrawer() {
  function Harness() {
    const snaps = getSnaps()
    const drawerY = useMotionValue(snaps.expanded)
    return (
      <JobDrawer
        jobs={[]} loading={false} selectedJobId={null}
        online onToggle={() => {}} toggling={false}
        activeJob={{ id: 'ug-accepted-1', lat: 32.08, lng: 34.78 }}
        onJobDone={() => {}} position={{ lat: 32.08, lng: 34.78 }}
        drawerY={drawerY} snaps={snaps}
      />
    )
  }
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter><Harness /></MemoryRouter>
    </I18nextProvider>
  )
}

beforeEach(() => { rpcMock.mockClear() })

describe('JobDrawer — Start trip on an underground accepted job', () => {
  it('sends accepted→en_route to the server via transition_order_status', async () => {
    renderDrawer()

    const startBtn = await screen.findByRole('button', { name: /start trip/i })
    fireEvent.click(startBtn)

    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    const call = rpcMock.mock.calls.find(([fn]) => fn === 'transition_order_status')
    expect(call).toBeTruthy()
    expect(call[1]).toMatchObject({ order_id: 'ug-accepted-1', new_status: 'en_route' })
    // No GPS is required/sent for the en_route hop.
    expect(call[1].washer_lat).toBeNull()
    expect(call[1].washer_lng).toBeNull()
  })
})
