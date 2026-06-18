import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import i18next from 'i18next'

const createSignedUrl = vi.fn()

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ error: null }),
    storage: { from: vi.fn(() => ({ createSignedUrl })) },
  },
}))

const fetchOrderDetails = vi.fn()
vi.mock('../lib/support.js', () => ({ fetchOrderDetails: (...a) => fetchOrderDetails(...a) }))

import OrderPanel from '../components/OrderPanel.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    order: {
      noOrder: 'No order', linkedOrder: 'Linked order', address: 'Address',
      consumer: 'Customer', washer: 'Washer', pricing: 'Pricing',
      consumerTotal: 'Consumer total', washerPayout: 'Washer payout',
      customerPhotos: 'Customer photos',
      photoSlots: { front: 'Front', back: 'Back', driver: 'Driver', passenger: 'Passenger' },
    },
    orderStatus: { accepted: 'Accepted' },
  } } },
  lng: 'en', fallbackLng: 'en',
})

const wrapper = ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>

const baseOrder = {
  id: 'order-1', status: 'accepted', total_price: 100, payout_amount: 60,
  consumer: { full_name: 'Noa', phone: '+972500000001' },
}

describe('OrderPanel — customer photos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/photo.jpg' } })
  })

  it('shows the 4 customer photos signed from the car-photos bucket', async () => {
    fetchOrderDetails.mockResolvedValue({ data: {
      ...baseOrder,
      car_photo_front: 'p/front.jpg', car_photo_back: 'p/back.jpg',
      car_photo_driver: 'p/driver.jpg', car_photo_passenger: 'p/passenger.jpg',
    } })
    const { supabase } = await import('../lib/supabase.js')

    render(<OrderPanel orderId="order-1" conversationStatus="open" />, { wrapper })

    await waitFor(() => expect(screen.getByText('Customer photos')).toBeInTheDocument())
    expect(supabase.storage.from).toHaveBeenCalledWith('car-photos')
    await waitFor(() => expect(createSignedUrl).toHaveBeenCalledTimes(4))
    for (const label of ['Front', 'Back', 'Driver', 'Passenger']) {
      await waitFor(() => expect(screen.getByRole('img', { name: label })).toBeInTheDocument())
    }
  })

  it('renders no photo section when the order has none', async () => {
    fetchOrderDetails.mockResolvedValue({ data: { ...baseOrder } })
    const { supabase } = await import('../lib/supabase.js')

    render(<OrderPanel orderId="order-1" conversationStatus="open" />, { wrapper })

    await waitFor(() => expect(screen.getByText('Accepted')).toBeInTheDocument())
    expect(screen.queryByText('Customer photos')).not.toBeInTheDocument()
    expect(supabase.storage.from).not.toHaveBeenCalled()
  })
})
