import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

vi.mock('../lib/support.js', () => ({
  fetchOrderDetails: vi.fn().mockResolvedValue({ data: null, error: null }),
}))
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel:       vi.fn().mockReturnThis(),
    on:            vi.fn().mockReturnThis(),
    subscribe:     vi.fn().mockReturnThis(),
    removeChannel: vi.fn(),
    rpc:           vi.fn(),
  },
}))
vi.mock('../lib/geocode.js', () => ({
  useReverseGeocode: vi.fn().mockReturnValue(null),
}))

import { fetchOrderDetails } from '../lib/support.js'
import OrderPanel from '../components/OrderPanel.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'order.title':    'Order details',
    'order.linkedOrder': 'Linked order',
    'order.noOrder':  'No order linked',
    'order.consumer': 'Customer',
    'order.washer':   'Washer',
    'order.total':    'Total',
    'order.address':  'Address',
    'order.pricing':  'Pricing',
    'order.consumerTotal': 'Consumer total',
    'order.washerPayout': 'Washer payout',
    'user.location':           'Location',
    'user.locationUnavailable': 'Location unavailable',
    'user.lastSeen':            'Last seen {{time}}',
    'orderStatus.pending': 'Pending',
    'orderStatus.accepted': 'Accepted',
    'orderStatus.en_route': 'En route',
    'orderStatus.arrived': 'Arrived',
    'orderStatus.in_progress': 'In progress',
    'orderStatus.pending_approval': 'Pending approval',
    'orderStatus.completed': 'Completed',
    'orderStatus.cancelled': 'Cancelled',
    'orderActions.cancel.button':     'Cancel order',
    'orderActions.complete.button':   'Mark complete (override)',
  } } },
  lng: 'en', fallbackLng: 'en',
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

const ORDER_ID = 'order-uuid-1234'

function makeOrder(overrides = {}) {
  return {
    id:           ORDER_ID,
    status:       'accepted',
    car_type:     'private',
    service_type: 'wash',
    base_price:   100,
    total_price:  100,
    created_at:   new Date().toISOString(),
    address_label: '123 Main St',
    payout_amount: 60,
    car_plate:    'ABC123',
    car_make:     'Toyota',
    car_model:    'Corolla',
    car_year:     2020,
    car_color:    'White',
    consumer: { id: 'c1', full_name: 'Alice Consumer', phone: '050-111' },
    washer:   overrides.washer ?? {
      id: 'w1', full_name: 'Bob Washer', phone: '050-222',
      last_lat: 32.0853, last_lng: 34.7818, last_location_at: new Date().toISOString(),
    },
    ...overrides,
  }
}

describe('OrderPanel — other party display', () => {
  it('shows washer location card when openerRole is consumer and washer has GPS', async () => {
    fetchOrderDetails.mockResolvedValueOnce({ data: makeOrder(), error: null })
    render(
      <OrderPanel orderId={ORDER_ID} conversationStatus="assigned" openerRole="consumer" />,
      { wrapper },
    )
    // Wait for the order to load
    const washerLabel = await screen.findByText('Location')
    expect(washerLabel).toBeInTheDocument()
  })

  it('does not show washer location card when openerRole is washer', async () => {
    fetchOrderDetails.mockResolvedValueOnce({ data: makeOrder(), error: null })
    render(
      <OrderPanel orderId={ORDER_ID} conversationStatus="assigned" openerRole="washer" />,
      { wrapper },
    )
    await screen.findByText('Bob Washer')
    expect(screen.queryByText('Location')).not.toBeInTheDocument()
  })

  it('shows Customer and Washer party rows', async () => {
    fetchOrderDetails.mockResolvedValueOnce({ data: makeOrder(), error: null })
    render(
      <OrderPanel orderId={ORDER_ID} conversationStatus="assigned" openerRole="consumer" />,
      { wrapper },
    )
    expect(await screen.findByText('Alice Consumer')).toBeInTheDocument()
    expect(screen.getByText('Bob Washer')).toBeInTheDocument()
  })

  it('hides washer location card when washer has no GPS', async () => {
    const order = makeOrder({
      washer: { id: 'w1', full_name: 'Bob Washer', phone: '050-222', last_lat: null, last_lng: null, last_location_at: null },
    })
    fetchOrderDetails.mockResolvedValueOnce({ data: order, error: null })
    render(
      <OrderPanel orderId={ORDER_ID} conversationStatus="assigned" openerRole="consumer" />,
      { wrapper },
    )
    await screen.findByText('Bob Washer')
    expect(screen.queryByText('Location')).not.toBeInTheDocument()
  })
})
