import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useMotionValue } from 'framer-motion'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'
import he from '../../../i18n/locales/he.json'

// ── Active underground order injected via the realtime-order hook ────────────
const UNDERGROUND_ORDER = {
  id: 'ug-order-1',
  status: 'en_route',
  is_underground_parking: true,
  access_notes: 'Garage level -2, spot 47',
  consumer_id: 'c1',
  base_price: 60,
  lat: 32.08, lng: 34.78,
  site_has_water: false, site_has_power: false,
}

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: vi.fn(),
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) },
  },
  isSupabaseConfigured: false,
}))

vi.mock('../../../hooks/useRealtimeOrder.js', () => ({
  useRealtimeOrder: () => ({ order: UNDERGROUND_ORDER, loading: false, error: null, mutateOrder: vi.fn() }),
}))

// Isolate the badge test from IndexedDB / the replay engine.
vi.mock('../../../hooks/useOfflineSync.js', () => ({
  useOfflineSync: () => ({ online: true, syncing: false, pending: 0, hasError: false, runReplay: vi.fn() }),
}))
vi.mock('../../../lib/offlineSync/engine.js', () => ({
  putDraftAngle: vi.fn(),
  commitCapture: vi.fn(),
  getCapturesByOrder: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../lib/geocode.js', () => ({
  useReverseGeocode: () => ({ address: '', loading: false }),
  looksLikeCoords: () => false,
  reverseGeocode: async () => null,
  forwardGeocode: async () => null,
}))
vi.mock('../../ui/Toast.jsx', () => ({ useToast: () => vi.fn(), ToastProvider: ({ children }) => children }))
vi.mock('../../editable/Editable.jsx', () => ({ default: ({ children }) => children }))
vi.mock('../../../hooks/useOrderUnreadCount.js', () => ({ useOrderUnreadCount: () => 0 }))
vi.mock('../../chat/OrderChatSheet.jsx', () => ({ default: () => null }))

import JobDrawer, { getSnaps } from '../JobDrawer.jsx'

function makeI18n(lng) {
  const i18n = i18next.createInstance()
  i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, he: { translation: he } },
    lng, fallbackLng: 'he', supportedLngs: ['en', 'he'],
    interpolation: { escapeValue: false },
  })
  return i18n
}

function renderDrawer(lng = 'en') {
  const i18n = makeI18n(lng)
  function Harness() {
    const snaps = getSnaps()
    const drawerY = useMotionValue(snaps.expanded)
    return (
      <JobDrawer
        jobs={[]} loading={false} selectedJobId={null}
        online onToggle={() => {}} toggling={false}
        activeJob={{ id: 'ug-order-1', lat: 32.08, lng: 34.78 }}
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

beforeEach(() => { vi.clearAllMocks() })

describe('JobDrawer — underground active job', () => {
  it('shows the prominent "no reception expected" badge (English)', async () => {
    renderDrawer('en')
    await waitFor(() => {
      expect(screen.getByText('Underground — no reception expected')).toBeInTheDocument()
    })
  })

  it('shows the access notes in full on the badge', async () => {
    renderDrawer('en')
    // Access notes appear in the prominent underground banner (and also in the
    // customer-card location row), so assert at least one occurrence.
    await waitFor(() => {
      expect(screen.getAllByText('Garage level -2, spot 47').length).toBeGreaterThan(0)
    })
  })

  it('renders the Hebrew badge string for he locale', async () => {
    renderDrawer('he')
    await waitFor(() => {
      expect(screen.getByText('תת-קרקעי — ללא קליטה צפויה')).toBeInTheDocument()
    })
  })
})
