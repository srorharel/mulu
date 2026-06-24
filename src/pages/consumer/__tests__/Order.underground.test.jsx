import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'

const { insertSpy, dupState } = vi.hoisted(() => ({ insertSpy: vi.fn(), dupState: { rows: [] } }))

vi.mock('../../../lib/supabase.js', () => {
  const vehicles = { data: [], error: null }
  const order    = { data: { id: 'new-order' }, error: null }
  const vehiclesBuilder = {
    select: () => vehiclesBuilder,
    order:  () => vehiclesBuilder,
    then:   (cb) => Promise.resolve(vehicles).then(cb),
  }
  // Duplicate-plate pre-check: orders.select().eq().eq().in().limit() resolves to
  // the configurable dupState.rows (empty = no live order on this plate).
  const dupBuilder = {
    select: () => dupBuilder,
    eq:     () => dupBuilder,
    in:     () => dupBuilder,
    limit:  () => Promise.resolve({ data: dupState.rows, error: null }),
  }
  return {
    supabase: {
      from: (table) => {
        if (table === 'orders') {
          return {
            ...dupBuilder,
            insert: (payload) => {
              insertSpy(payload)
              return { select: () => ({ single: () => Promise.resolve(order) }) }
            },
          }
        }
        return vehiclesBuilder
      },
    },
    isSupabaseConfigured: true,
  }
})

vi.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { full_name: 'Test User' } }),
}))
vi.mock('../../../hooks/useGeolocation.js', () => ({
  // Holon centre — must be inside the pilot service-area geofence (serviceArea.js),
  // or Order.handleBook blocks the order and insertSpy is never called.
  useGeolocation: () => ({ position: { lat: 32.0167, lng: 34.7795 }, error: null, permissionState: 'granted', requestPermission: vi.fn() }),
}))
vi.mock('../../../hooks/useFirstWashDiscount.js', () => ({
  useFirstWashDiscount: () => ({ eligible: false, loading: false }),
}))
vi.mock('../../../hooks/useTheme.js', () => ({ useTheme: () => ({ isDark: false }) }))
vi.mock('../../../components/ui/Toast.jsx', () => ({ useToast: () => vi.fn(), ToastProvider: ({ children }) => children }))
vi.mock('../../../lib/geocode.js', () => ({
  useReverseGeocode: () => ({ address: 'Rothschild 1, Tel Aviv' }),
  looksLikeCoords: () => false,
}))

// Child component stubs that drive the form into a submittable state on click.
vi.mock('../../../components/consumer/LicensePlatePicker.jsx', () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange({ make: 'Toyota', model: 'Corolla', year: 2020, plate: '1234567', color: 'White', category: 'private', isValid: true })}>
      stub-set-vehicle
    </button>
  ),
}))
vi.mock('../../../components/consumer/CarPhotoUpload.jsx', () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange({ front: { path: 'f' }, back: { path: 'b' }, driver: { path: 'd' }, passenger: { path: 'p' } })}>
      stub-set-photos
    </button>
  ),
}))
// Confirming a location now requires a house number; the stub returns one inside
// the Holon service-area so handleBook accepts the order.
vi.mock('../../../components/consumer/LocationSheet.jsx', () => ({
  default: ({ onConfirm }) => (
    <button
      type="button"
      onClick={() => onConfirm({ lat: 32.0167, lng: 34.7795, address_label: 'Rothschild 1, Holon', address_street: 'Rothschild', address_number: '1', address_city: 'Holon' })}
    >
      stub-set-location
    </button>
  ),
}))
vi.mock('../../../components/consumer/VehiclePickerSheet.jsx', () => ({ default: () => null }))
vi.mock('../../../components/consumer/SaveVehicleDialog.jsx', () => ({ default: () => null }))
vi.mock('../../../components/editable/Editable.jsx', () => ({ default: ({ children }) => children }))

import ConsumerOrder from '../Order.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
})

function renderOrder() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter><ConsumerOrder /></MemoryRouter>
    </I18nextProvider>
  )
}

async function readyForm() {
  await waitFor(() => screen.getByText('stub-set-vehicle'))
  fireEvent.click(screen.getByText('stub-set-vehicle'))
  fireEvent.click(screen.getByText('stub-set-photos'))
  fireEvent.click(screen.getByText('stub-set-location'))
}

beforeEach(() => { insertSpy.mockClear(); dupState.rows = [] })

describe('ConsumerOrder — address / house number requirement', () => {
  it('blocks booking until the location is confirmed with a house number', async () => {
    renderOrder()
    await waitFor(() => screen.getByText('stub-set-vehicle'))
    fireEvent.click(screen.getByText('stub-set-vehicle'))
    fireEvent.click(screen.getByText('stub-set-photos'))

    // GPS is available but no address was confirmed → CTA disabled, no order.
    expect(screen.getByRole('button', { name: /continue to payment/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))
    await Promise.resolve()
    expect(insertSpy).not.toHaveBeenCalled()

    // Confirm a location carrying a house number → CTA enabled, order books with it.
    fireEvent.click(screen.getByText('stub-set-location'))
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))
    await waitFor(() => expect(insertSpy).toHaveBeenCalled())
    expect(insertSpy.mock.calls[0][0].address_number).toBe('1')
  })
})

describe('ConsumerOrder — underground parking booking', () => {
  it('books with is_underground_parking:false when the toggle is off (notes not required)', async () => {
    renderOrder()
    await readyForm()
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))
    await waitFor(() => expect(insertSpy).toHaveBeenCalled())
    expect(insertSpy.mock.calls[0][0].is_underground_parking).toBe(false)
  })

  it('requires access notes when underground is ON (blocks submit, shows the requirement)', async () => {
    renderOrder()
    await readyForm()
    fireEvent.click(screen.getByRole('button', { name: /underground parking/i }))

    // The requirement message is shown and the CTA is disabled.
    expect(screen.getByText(/access notes are required for underground/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue to payment/i })).toBeDisabled()

    // Clicking the disabled CTA does not create an order.
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))
    await Promise.resolve()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('books with is_underground_parking:true once access notes are provided', async () => {
    renderOrder()
    await readyForm()
    fireEvent.click(screen.getByRole('button', { name: /underground parking/i }))
    fireEvent.change(screen.getByPlaceholderText(/how to reach your car/i), {
      target: { value: 'Garage level -2, spot 47' },
    })
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))
    await waitFor(() => expect(insertSpy).toHaveBeenCalled())
    const payload = insertSpy.mock.calls[0][0]
    expect(payload.is_underground_parking).toBe(true)
    expect(payload.access_notes).toBe('Garage level -2, spot 47')
  })
})

describe('ConsumerOrder — one active order per vehicle', () => {
  it('blocks a second booking on the same plate while one is live, and shows the message', async () => {
    dupState.rows = [{ id: 'existing-live-order' }] // a live order already exists for this plate
    renderOrder()
    await readyForm()
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))
    // Pre-check finds a live order → no insert, the customer sees a clear message.
    await waitFor(() =>
      expect(screen.getByText(/already have an active wash for this vehicle/i)).toBeInTheDocument(),
    )
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('books normally when the vehicle has no live order', async () => {
    dupState.rows = [] // no live order for this plate
    renderOrder()
    await readyForm()
    fireEvent.click(screen.getByRole('button', { name: /continue to payment/i }))
    await waitFor(() => expect(insertSpy).toHaveBeenCalled())
  })
})
