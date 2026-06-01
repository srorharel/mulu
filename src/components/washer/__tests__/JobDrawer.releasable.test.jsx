import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'
import he from '../../../i18n/locales/he.json'

const { orderRef } = vi.hoisted(() => ({
  orderRef: { current: { id: 'job1', status: 'en_route', base_price: 50, is_underground_parking: false } },
}))

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
  useRealtimeOrder: () => ({ order: orderRef.current, mutateOrder: vi.fn(), loading: false, error: null }),
}))
vi.mock('../../../lib/geocode.js', () => ({
  useReverseGeocode: () => ({ address: '', loading: false }),
  looksLikeCoords: () => false,
}))
vi.mock('../../ui/Toast.jsx', () => ({ useToast: () => vi.fn(), ToastProvider: ({ children }) => children }))
vi.mock('../../editable/Editable.jsx', () => ({ default: ({ children }) => children }))
vi.mock('../../../hooks/useOrderUnreadCount.js', () => ({ useOrderUnreadCount: () => 0 }))
vi.mock('../../../hooks/useOfflineSync.js', () => ({
  useOfflineSync: () => ({ syncing: false, pending: 0, runReplay: vi.fn() }),
}))
vi.mock('../../chat/OrderChatSheet.jsx', () => ({ default: () => null }))

import JobDrawer from '../JobDrawer.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, he: { translation: he } },
  lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
})

const ACTIVE_JOB = { id: 'job1', lat: 32.05, lng: 34.80 }

function renderDrawer() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <JobDrawer
          jobs={[]} loading={false} selectedJobId={null}
          online onToggle={() => {}} toggling={false}
          activeJob={ACTIVE_JOB} onJobDone={() => {}}
          position={{ lat: 32.05, lng: 34.80 }}
        />
      </MemoryRouter>
    </I18nextProvider>
  )
}

beforeEach(() => {
  orderRef.current = { id: 'job1', status: 'en_route', base_price: 50, is_underground_parking: false }
})

describe('JobDrawer — releasable sheet from en_route', () => {
  it('shows a drag handle (releasable) when status is en_route', () => {
    orderRef.current.status = 'en_route'
    const { container } = renderDrawer()
    expect(container.querySelector('.cursor-grab')).toBeTruthy()
  })

  it('does NOT show a drag handle pre-en_route (accepted = locked expanded)', () => {
    orderRef.current.status = 'accepted'
    const { container } = renderDrawer()
    expect(container.querySelector('.cursor-grab')).toBeNull()
  })

  it('stays releasable through arrived / in_progress', () => {
    for (const status of ['arrived', 'in_progress']) {
      orderRef.current.status = status
      const { container, unmount } = renderDrawer()
      expect(container.querySelector('.cursor-grab')).toBeTruthy()
      unmount()
    }
  })
})
