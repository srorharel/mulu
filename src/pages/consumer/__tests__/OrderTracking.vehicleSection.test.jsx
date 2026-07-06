import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createInstance } from 'i18next'
import { initReactI18next, I18nextProvider } from 'react-i18next'
import en from '../../../i18n/locales/en.json'
import he from '../../../i18n/locales/he.json'
import OrderTracking from '../OrderTracking.jsx'
import { useRealtimeOrder } from '../../../hooks/useRealtimeOrder.js'

// ── Module mocks ─────────────────────────────────────────────────────────────

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

vi.mock('../../../hooks/useRealtimeOrder.js', () => ({
  useRealtimeOrder: vi.fn(),
}))

vi.mock('../../../lib/geocode.js', () => ({
  useReverseGeocode: vi.fn(() => ({ address: null })),
  looksLikeCoords: vi.fn(() => false),
}))

vi.mock('../../../components/ui/Toast.jsx', () => ({
  useToast: vi.fn(() => vi.fn()),
  ToastProvider: ({ children }) => children,
}))

vi.mock('../../../components/support/SupportChatSheet.jsx', () => ({
  default: () => null,
}))

vi.mock('../../../components/chat/OrderChatSheet.jsx', () => ({
  default: () => null,
}))

vi.mock('../../../context/CallContext.jsx', () => ({ useCall: () => ({ startCall: () => {} }) }))

vi.mock('../../../lib/support.js', () => ({
  getOrCreateOrderConversation: vi.fn().mockResolvedValue({ data: { id: 'conv-1' } }),
}))

vi.mock('../../../hooks/useOrderUnreadCount.js', () => ({
  useOrderUnreadCount: vi.fn(() => 0),
}))

vi.mock('../../../components/consumer/OrderTrackingMap.jsx', () => ({
  default: () => null,
}))

vi.mock('../../../components/ui/MapBG.jsx', () => ({
  default: () => null,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function createTestI18n(language = 'he') {
  const instance = createInstance()
  instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    resources: { en: { translation: en }, he: { translation: he } },
    interpolation: { escapeValue: false },
    initImmediate: false,
  })
  return instance
}

function renderTracking(language = 'he') {
  const i18n = createTestI18n(language)
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/order/test-id']}>
        <Routes>
          <Route path="/order/:id" element={<OrderTracking />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>
  )
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseOrder = {
  id: 'test-id',
  status: 'accepted',
  washer_id: null,
  total_price: 100,
  address_label: 'כתובת בדיקה',
  car_plate: '8626073',
  car_make: 'יונדאי',
  car_model: 'I20',
  car_year: 2010,
  car_color: 'תכלת',
  car_type: 'private', // real orders column (there is no `category` on orders)
  rated_at: null,
  cancellation_reason: null,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OrderTracking — vehicle card section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all vehicle fields joined by · on a single line', () => {
    useRealtimeOrder.mockReturnValue({ order: baseOrder, loading: false, error: null })
    const { container } = renderTracking('he')

    // Find the truncated vehicle text paragraph
    const vehiclePara = container.querySelector('[data-testid="vehicle-card"] .truncate')
    expect(vehiclePara).not.toBeNull()
    expect(vehiclePara.textContent).toContain('יונדאי')
    expect(vehiclePara.textContent).toContain('I20')
    expect(vehiclePara.textContent).toContain('2010')
    expect(vehiclePara.textContent).toContain('תכלת')
    // Category is translated: 'private' → 'פרטי'
    expect(vehiclePara.textContent).toContain('פרטי')
    // All joined with ·, not split across elements
    expect(vehiclePara.textContent).toMatch(/יונדאי · I20 · 2010 · תכלת · פרטי/)
  })

  it('omits missing vehicle fields from the joined string', () => {
    const order = { ...baseOrder, car_color: null, car_year: null }
    useRealtimeOrder.mockReturnValue({ order, loading: false, error: null })
    const { container } = renderTracking('he')

    const vehiclePara = container.querySelector('[data-testid="vehicle-card"] .truncate')
    expect(vehiclePara).not.toBeNull()
    const text = vehiclePara.textContent
    // No double separator, no leading/trailing ·
    expect(text).not.toMatch(/· ·/)
    expect(text).not.toMatch(/^·/)
    expect(text).not.toMatch(/·$/)
    // No literal null or undefined
    expect(text).not.toContain('null')
    expect(text).not.toContain('undefined')
    // Present fields still appear
    expect(text).toContain('יונדאי')
    expect(text).toContain('I20')
    expect(text).toContain('פרטי')
  })

  it('plate and text row share the same flex container with items-center', () => {
    useRealtimeOrder.mockReturnValue({ order: baseOrder, loading: false, error: null })
    const { container } = renderTracking('he')

    const card = container.querySelector('[data-testid="vehicle-card"]')
    expect(card).not.toBeNull()
    // The direct child row
    const row = card.firstElementChild
    expect(row.classList).toContain('flex')
    expect(row.classList).toContain('items-center')
  })

  it('vehicle text column uses truncate, not multi-line wrap', () => {
    useRealtimeOrder.mockReturnValue({ order: baseOrder, loading: false, error: null })
    const { container } = renderTracking('he')

    const vehiclePara = container.querySelector('[data-testid="vehicle-card"] p.truncate')
    expect(vehiclePara).not.toBeNull()
    // Parent column has flex-1 and min-w-0
    const col = vehiclePara.parentElement
    expect(col.classList).toContain('flex-1')
    expect(col.classList).toContain('min-w-0')
  })

  it('renders correctly in LTR (English)', () => {
    useRealtimeOrder.mockReturnValue({ order: baseOrder, loading: false, error: null })
    const { container } = renderTracking('en')

    const vehiclePara = container.querySelector('[data-testid="vehicle-card"] .truncate')
    expect(vehiclePara).not.toBeNull()
    const text = vehiclePara.textContent
    // Still a single joined string
    expect(text).toContain('יונדאי')
    expect(text).toContain('I20')
    // Category translated in English
    expect(text).toContain('Private')
    // No double separators
    expect(text).not.toMatch(/· ·/)
  })

  it('category label is translated, not raw key', () => {
    useRealtimeOrder.mockReturnValue({ order: baseOrder, loading: false, error: null })

    // Hebrew
    const { container: heContainer } = renderTracking('he')
    const hePara = heContainer.querySelector('[data-testid="vehicle-card"] .truncate')
    expect(hePara.textContent).toContain('פרטי')
    expect(hePara.textContent).not.toContain('private')

    // English (new render)
    vi.clearAllMocks()
    useRealtimeOrder.mockReturnValue({ order: baseOrder, loading: false, error: null })
    const { container: enContainer } = renderTracking('en')
    const enPara = enContainer.querySelector('[data-testid="vehicle-card"] .truncate')
    expect(enPara.textContent).toContain('Private')
    expect(enPara.textContent).not.toContain('private')
  })
})
