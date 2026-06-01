import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'

const { insertSpy } = vi.hoisted(() => ({ insertSpy: vi.fn() }))

vi.mock('../../../lib/supabase.js', () => {
  const vehicles = { data: [], error: null }
  const order    = { data: { id: 'new-order' }, error: null }
  const vehiclesBuilder = {
    select: () => vehiclesBuilder,
    order:  () => vehiclesBuilder,
    then:   (cb) => Promise.resolve(vehicles).then(cb),
  }
  return {
    supabase: {
      from: (table) => {
        if (table === 'orders') {
          return {
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
  useGeolocation: () => ({ position: { lat: 32.08, lng: 34.78 }, error: null, permissionState: 'granted', requestPermission: vi.fn() }),
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

async function readyForm() {
  await waitFor(() => screen.getByText('stub-set-vehicle'))
  fireEvent.click(screen.getByText('stub-set-vehicle'))
  fireEvent.click(screen.getByText('stub-set-photos'))
}

beforeEach(() => { insertSpy.mockClear() })

describe('ConsumerHome — underground parking booking', () => {
  it('books with is_underground_parking:false when the toggle is off (notes not required)', async () => {
    renderHome()
    await readyForm()
    fireEvent.click(screen.getByRole('button', { name: /book wash/i }))
    await waitFor(() => expect(insertSpy).toHaveBeenCalled())
    expect(insertSpy.mock.calls[0][0].is_underground_parking).toBe(false)
  })

  it('requires access notes when underground is ON (blocks submit, shows the requirement)', async () => {
    renderHome()
    await readyForm()
    fireEvent.click(screen.getByRole('button', { name: /underground parking/i }))

    // The requirement message is shown and the CTA is disabled.
    expect(screen.getByText(/access notes are required for underground/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /book wash/i })).toBeDisabled()

    // Clicking the disabled CTA does not create an order.
    fireEvent.click(screen.getByRole('button', { name: /book wash/i }))
    await Promise.resolve()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('books with is_underground_parking:true once access notes are provided', async () => {
    renderHome()
    await readyForm()
    fireEvent.click(screen.getByRole('button', { name: /underground parking/i }))
    fireEvent.change(screen.getByPlaceholderText(/how to reach your car/i), {
      target: { value: 'Garage level -2, spot 47' },
    })
    fireEvent.click(screen.getByRole('button', { name: /book wash/i }))
    await waitFor(() => expect(insertSpy).toHaveBeenCalled())
    const payload = insertSpy.mock.calls[0][0]
    expect(payload.is_underground_parking).toBe(true)
    expect(payload.access_notes).toBe('Garage level -2, spot 47')
  })
})
