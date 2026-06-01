import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'

const { navigateMock, ordersRef } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  ordersRef: { current: [] },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('../../../lib/supabase.js', () => {
  const vehicles = { data: [], error: null }
  const vehiclesBuilder = {
    select: () => vehiclesBuilder,
    order:  () => vehiclesBuilder,
    then:   (cb) => Promise.resolve(vehicles).then(cb),
  }
  return {
    supabase: { from: () => vehiclesBuilder },
    isSupabaseConfigured: true,
  }
})

vi.mock('../../../hooks/useConsumerActiveOrders.js', () => ({
  useConsumerActiveOrders: () => ({ orders: ordersRef.current, loading: false }),
}))
vi.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { full_name: 'Test User' } }),
}))
vi.mock('../../../hooks/useGeolocation.js', () => ({
  useGeolocation: () => ({ position: { lat: 32.08, lng: 34.78 }, error: null, permissionState: 'granted', requestPermission: vi.fn() }),
}))
vi.mock('../../../hooks/useTheme.js', () => ({ useTheme: () => ({ isDark: false }) }))
vi.mock('../../../components/ui/Toast.jsx', () => ({ useToast: () => vi.fn(), ToastProvider: ({ children }) => children }))
vi.mock('../../../lib/geocode.js', () => ({
  useReverseGeocode: () => ({ address: 'Rothschild 1, Tel Aviv' }),
  looksLikeCoords: () => false,
}))
vi.mock('../../../components/consumer/LicensePlatePicker.jsx', () => ({ default: () => null }))
vi.mock('../../../components/consumer/CarPhotoUpload.jsx', () => ({ default: () => null }))
vi.mock('../../../components/consumer/LocationSheet.jsx', () => ({ default: () => null }))
vi.mock('../../../components/consumer/VehiclePickerSheet.jsx', () => ({ default: () => null }))
vi.mock('../../../components/consumer/SaveVehicleDialog.jsx', () => ({ default: () => null }))
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
})

describe('ConsumerHome — active orders list', () => {
  it('renders the booking page (not redirected) AND the active order when one exists', async () => {
    ordersRef.current = [
      { id: 'o1', status: 'en_route', address_label: 'Rothschild 1', total_price: 50, created_at: '2026-01-02' },
    ]
    renderHome()

    // Booking page still renders — /home is not hijacked by the active order.
    await waitFor(() => expect(screen.getByText(/where's your car parked/i)).toBeInTheDocument())
    // Active order list is shown.
    expect(screen.getByText('Active orders')).toBeInTheDocument()
    expect(screen.getByText('Rothschild 1')).toBeInTheDocument()
  })

  it('opens /order/:id when an active-order row is tapped', async () => {
    ordersRef.current = [
      { id: 'o1', status: 'en_route', address_label: 'Rothschild 1', total_price: 50, created_at: '2026-01-02' },
    ]
    renderHome()
    fireEvent.click(await screen.findByText('Rothschild 1'))
    expect(navigateMock).toHaveBeenCalledWith('/order/o1')
  })

  it('renders multiple active orders', async () => {
    ordersRef.current = [
      { id: 'o1', status: 'en_route', address_label: 'Rothschild 1', total_price: 50, created_at: '2026-01-02' },
      { id: 'o2', status: 'pending',  address_label: 'Dizengoff 2',  total_price: 60, created_at: '2026-01-01' },
    ]
    renderHome()
    expect(await screen.findByText('Rothschild 1')).toBeInTheDocument()
    expect(screen.getByText('Dizengoff 2')).toBeInTheDocument()
  })
})
