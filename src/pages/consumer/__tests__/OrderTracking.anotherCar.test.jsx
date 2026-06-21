import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createInstance } from 'i18next'
import { initReactI18next, I18nextProvider } from 'react-i18next'
import en from '../../../i18n/locales/en.json'
import he from '../../../i18n/locales/he.json'
import OrderTracking from '../OrderTracking.jsx'
import { useRealtimeOrder } from '../../../hooks/useRealtimeOrder.js'

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}))

vi.mock('../../../hooks/useRealtimeOrder.js', () => ({ useRealtimeOrder: vi.fn() }))
vi.mock('../../../hooks/useOrderWasherTracking.js', () => ({
  useOrderWasherTracking: () => ({ location: null, etaMin: null, stale: false }),
}))
vi.mock('../../../hooks/useOrderUnreadCount.js', () => ({ useOrderUnreadCount: () => 0 }))
vi.mock('../../../lib/geocode.js', () => ({
  useReverseGeocode: () => ({ address: null }),
  looksLikeCoords: () => false,
}))
vi.mock('../../../components/ui/Toast.jsx', () => ({
  useToast: () => vi.fn(),
  ToastProvider: ({ children }) => children,
}))
vi.mock('../../../components/support/SupportChatSheet.jsx', () => ({ default: () => null }))
vi.mock('../../../components/chat/OrderChatSheet.jsx', () => ({ default: () => null }))
vi.mock('../../../context/CallContext.jsx', () => ({ useCall: () => ({ startCall: () => {} }) }))
vi.mock('../../../lib/support.js', () => ({
  getOrCreateOrderConversation: vi.fn().mockResolvedValue({ data: { id: 'c1' } }),
}))
vi.mock('../../../components/consumer/OrderTrackingMap.jsx', () => ({ default: () => null }))
vi.mock('../../../components/ui/MapBG.jsx', () => ({ default: () => null }))

function createTestI18n(language = 'en') {
  const instance = createInstance()
  instance.use(initReactI18next).init({
    lng: language, fallbackLng: 'en',
    resources: { en: { translation: en }, he: { translation: he } },
    interpolation: { escapeValue: false }, initImmediate: false,
  })
  return instance
}

const baseOrder = {
  id: 'o1', status: 'pending', total_price: 50, washer_id: null,
  lat: 32.05, lng: 34.80, address_label: 'Somewhere', category: 'private',
  is_underground_parking: false, rated_at: null, cancellation_reason: null,
}

function renderTracking(order) {
  useRealtimeOrder.mockReturnValue({ order, loading: false, error: null })
  const i18n = createTestI18n('en')
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/order/o1']}>
        <Routes>
          <Route path="/order/:id" element={<OrderTracking />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>
  )
}

beforeEach(() => { navigateMock.mockClear() })

describe('OrderTracking — "Another car to wash"', () => {
  it('is shown while the order is pending', () => {
    renderTracking({ ...baseOrder, status: 'pending' })
    expect(screen.getByRole('button', { name: /another car to wash/i })).toBeInTheDocument()
  })

  it('is shown during en_route and navigates to /book when clicked', () => {
    renderTracking({ ...baseOrder, status: 'en_route' })
    fireEvent.click(screen.getByRole('button', { name: /another car to wash/i }))
    expect(navigateMock).toHaveBeenCalledWith('/book')
  })

  it('is hidden on a terminal status (completed)', () => {
    renderTracking({ ...baseOrder, status: 'completed' })
    expect(screen.queryByRole('button', { name: /another car to wash/i })).toBeNull()
  })
})
