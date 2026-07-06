import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useMotionValue } from 'framer-motion'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'
import he from '../../../i18n/locales/he.json'

// Hoisted holders: the realtime-order hook returns h.order (status varies per
// test to prove the "view car photos" action is present in EVERY wash stage),
// and the storage mock signs the customer's 4 booking photos from car-photos.
const h = vi.hoisted(() => {
  const createSignedUrl = vi.fn()
  const storageFrom = vi.fn(() => ({ createSignedUrl }))
  return { order: null, createSignedUrl, storageFrom }
})

function makeOrder(status) {
  return {
    id: 'ph-order-1',
    status,
    is_underground_parking: false,
    consumer_id: 'c1',
    base_price: 60,
    payout_amount: 50,
    lat: 32.08, lng: 34.78,
    // New-shape 4-angle customer photos (front/back/driver/passenger).
    car_photo_front:     'c1/ph-order-1/front.jpg',
    car_photo_back:      'c1/ph-order-1/back.jpg',
    car_photo_driver:    'c1/ph-order-1/driver.jpg',
    car_photo_passenger: 'c1/ph-order-1/passenger.jpg',
  }
}

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: vi.fn(),
    storage: { from: h.storageFrom },
  },
  isSupabaseConfigured: false,
}))

vi.mock('../../../hooks/useRealtimeOrder.js', () => ({
  useRealtimeOrder: () => ({ order: h.order, loading: false, error: null, mutateOrder: vi.fn() }),
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
        activeJob={{ id: 'ph-order-1', lat: 32.08, lng: 34.78 }}
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

beforeEach(() => {
  vi.clearAllMocks()
  h.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/photo.jpg' } })
})

describe('JobDrawer — customer car photos action', () => {
  // The whole point of the feature: the washer can pull up the customer's car
  // photos at any point in the job, not just one stage.
  const STAGES = ['accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval', 'completed']
  for (const status of STAGES) {
    it(`shows the "view car photos" action during ${status}`, async () => {
      h.order = makeOrder(status)
      renderDrawer('en')
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'View car photos' })).toBeInTheDocument(),
      )
      // Photos are signed from the private car-photos bucket (washer-read RLS).
      expect(h.storageFrom).toHaveBeenCalledWith('car-photos')
    })
  }

  it('opens the full-screen gallery when the action is tapped', async () => {
    h.order = makeOrder('completed')
    renderDrawer('en')
    const btn = await screen.findByRole('button', { name: 'View car photos' })
    // alt="" thumbnails are presentational (no "img" role), so count DOM nodes.
    const before = document.querySelectorAll('img').length // signed thumbnails
    fireEvent.click(btn)
    // The lightbox mounts one more (enlarged) image.
    await waitFor(() => expect(document.querySelectorAll('img').length).toBe(before + 1))
  })

  it('renders the Hebrew label', async () => {
    h.order = makeOrder('accepted')
    renderDrawer('he')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'צפה בתמונות הרכב' })).toBeInTheDocument(),
    )
  })

  it('shows no action when the order has no customer photos', async () => {
    h.order = { ...makeOrder('in_progress'), car_photo_front: null, car_photo_back: null, car_photo_driver: null, car_photo_passenger: null }
    renderDrawer('en')
    // Wait for the always-present vehicle card heading, then assert no button.
    await waitFor(() => expect(screen.getByText('Vehicle')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'View car photos' })).not.toBeInTheDocument()
  })
})
