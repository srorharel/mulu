import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createInstance } from 'i18next'
import { initReactI18next, I18nextProvider } from 'react-i18next'
import en from '../../../i18n/locales/en.json'
import he from '../../../i18n/locales/he.json'
import OrderHistory from '../OrderHistory.jsx'
import { supabase } from '../../../lib/supabase.js'
import { ToastProvider } from '../../../components/ui/Toast.jsx'

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../lib/supabase.js', () => ({
  supabase: { from: vi.fn() },
}))

vi.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'user-test-1' } })),
}))

vi.mock('../../../components/ui/PageShell.jsx', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

vi.mock('../../../components/ui/GlassCard.jsx', () => ({
  default: ({ children, className }) => <div className={className}>{children}</div>,
}))

vi.mock('../../../components/Skeleton.jsx', () => ({
  HistoryRowSkeleton: () => null,
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

function setupSupabaseMock(orders) {
  supabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue(Promise.resolve({ data: orders })),
      }),
    }),
  })
}

function renderHistory(language = 'he', orders = mockOrders) {
  setupSupabaseMock(orders)
  const i18n = createTestI18n(language)
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <ToastProvider>
          <OrderHistory />
        </ToastProvider>
      </MemoryRouter>
    </I18nextProvider>
  )
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const currentYear = new Date().getFullYear()

function makeOrder(id, totalPrice, status = 'completed') {
  return {
    id,
    consumer_id: 'user-test-1',
    status,
    total_price: totalPrice,
    created_at: new Date(currentYear, 0, 15, 10, 0, 0).toISOString(),
    car_plate: '8626073',
    car_make: 'Toyota',
    car_model: 'Corolla',
    car_color: 'White',
    car_type: 'private',
  }
}

// 5 orders; prices sum to a distinctive 347 (100+80+60+60+47)
const mockOrders = [
  makeOrder('o1', 100),
  makeOrder('o2', 80),
  makeOrder('o3', 60),
  makeOrder('o4', 60),
  makeOrder('o5', 47),
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OrderHistory — summary card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render the total spent figure', async () => {
    const { container } = renderHistory('he')
    await act(async () => {})

    // The distinctive sum 347 must not appear anywhere
    expect(container.textContent).not.toContain('347')
    // The Hebrew spent label must not appear
    expect(container.textContent).not.toContain('הוצאה')
    // No ₪ followed by the sum amount
    expect(container.textContent).not.toMatch(/₪\s*347/)
  })

  it('still renders the wash count', async () => {
    renderHistory('he')
    await act(async () => {})

    // The count '5' is the large number in the summary card
    expect(screen.getByText('5')).toBeInTheDocument()
    // The wash-count label (Hebrew: שטיפות)
    expect(screen.getByText(/שטיפות/)).toBeInTheDocument()
  })

  it('per-order prices in the history list are unaffected', async () => {
    const { container } = renderHistory('he')
    await act(async () => {})

    // At least one individual order price still renders in a row
    expect(container.textContent).toContain('₪100')
    expect(container.textContent).toContain('₪47')
  })

  it('renders correctly when the consumer has zero orders', async () => {
    const { container } = renderHistory('he', [])
    await act(async () => {})

    // Empty state must not contain the summary card or any spend artifact
    expect(container.textContent).not.toContain('NaN')
    expect(container.textContent).not.toContain('₪—')
    // No spend number from a previous render leaks in
    expect(container.textContent).not.toContain('347')
    // Empty-state renders (Hebrew bookNow label appears, no summary card)
    expect(container.textContent).toContain('הזמן שטיפה')
  })

  it('renders in both locales without a spend figure', async () => {
    // Hebrew
    const { container: heContainer } = renderHistory('he')
    await act(async () => {})
    expect(heContainer.textContent).not.toContain('347')
    expect(heContainer.textContent).not.toContain('הוצאה')

    // English — fresh render
    vi.clearAllMocks()
    const { container: enContainer } = renderHistory('en')
    await act(async () => {})
    expect(enContainer.textContent).not.toContain('347')
    expect(enContainer.textContent).not.toContain('spent')
  })
})
