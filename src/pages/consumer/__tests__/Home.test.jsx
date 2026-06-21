import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'

const { navigateMock, ordersRef, lastWashRef } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  ordersRef: { current: [] },
  lastWashRef: { current: [] },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigateMock }
})

// Table-aware builder: the 'orders' query (last completed wash) reads lastWashRef;
// 'vehicles' (re-book row) reads an empty list.
vi.mock('../../../lib/supabase.js', () => {
  const builder = (dataRef) => {
    const b = {
      select: () => b,
      eq:     () => b,
      order:  () => b,
      limit:  () => b,
      then:   (cb) => Promise.resolve({ data: dataRef.current, error: null }).then(cb),
    }
    return b
  }
  const empty = { current: [] }
  return {
    supabase: { from: (table) => builder(table === 'orders' ? lastWashRef : empty) },
    isSupabaseConfigured: true,
  }
})

vi.mock('../../../hooks/useConsumerActiveOrders.js', () => ({
  useConsumerActiveOrders: () => ({ orders: ordersRef.current, loading: false }),
}))
vi.mock('../../../hooks/useFirstWashDiscount.js', () => ({
  useFirstWashDiscount: () => ({ eligible: false, loading: false }),
}))
vi.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { full_name: 'Test User' } }),
}))
vi.mock('../../../components/editable/Editable.jsx', () => ({ default: ({ children }) => children }))

import ConsumerHome from '../Home.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
})

function renderHome() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter><ConsumerHome /></MemoryRouter>
    </I18nextProvider>
  )
}

beforeEach(() => {
  navigateMock.mockClear()
  ordersRef.current = []
  lastWashRef.current = []
})

describe('ConsumerHome — launchpad', () => {
  it('renders the greeting and the hero booking CTA', async () => {
    renderHome()
    expect(screen.getByText(/good (morning|afternoon|evening), Test/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /book a wash/i })).toBeInTheDocument()
  })

  it('navigates to /book (the order page) when the hero CTA is tapped', async () => {
    renderHome()
    fireEvent.click(await screen.findByRole('button', { name: /book a wash/i }))
    expect(navigateMock).toHaveBeenCalledWith('/book')
  })

  it('shows active orders and opens /order/:id when a row is tapped', async () => {
    ordersRef.current = [
      { id: 'o1', status: 'en_route', address_label: 'Rothschild 1', total_price: 50, created_at: '2026-01-02' },
    ]
    renderHome()
    expect(screen.getByText('Active orders')).toBeInTheDocument()
    fireEvent.click(await screen.findByText('Rothschild 1'))
    expect(navigateMock).toHaveBeenCalledWith('/order/o1')
  })

  it('shows a re-wash nudge from the last completed wash and books on tap', async () => {
    lastWashRef.current = [{ completed_at: new Date(Date.now() - 10 * 86_400_000).toISOString() }]
    renderHome()
    const nudge = await screen.findByText(/it's been 10 days since your last wash/i)
    fireEvent.click(nudge)
    expect(navigateMock).toHaveBeenCalledWith('/book')
  })

  it('hides the re-wash nudge while an order is active', async () => {
    lastWashRef.current = [{ completed_at: new Date(Date.now() - 10 * 86_400_000).toISOString() }]
    ordersRef.current = [
      { id: 'o1', status: 'en_route', address_label: 'Rothschild 1', total_price: 50, created_at: '2026-01-02' },
    ]
    renderHome()
    await screen.findByText('Rothschild 1')
    expect(screen.queryByText(/since your last wash/i)).toBeNull()
  })
})
