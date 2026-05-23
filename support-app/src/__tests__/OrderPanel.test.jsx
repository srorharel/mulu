import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

// Mock supabase before importing the component
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}))

vi.mock('../lib/support.js', () => ({
  fetchOrderDetails: vi.fn().mockResolvedValue({
    data: {
      id: 'order-uuid-1234',
      status: 'accepted',
      total_price: 100,
      payout_amount: 60,
      car_plate: '48-271-95',
      car_make: 'Toyota',
      car_model: 'Corolla',
      car_year: 2021,
      car_color: 'White',
      address_label: 'Habarzel 23, Tel Aviv',
      consumer: { full_name: 'Noa Avraham', phone: '+972500000001' },
      washer: { full_name: 'Yossi Mizrahi', phone: '+972500000002', is_online: true },
    },
  }),
}))

import OrderPanel from '../components/OrderPanel.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'order.title': 'Linked order',
    'order.consumer': 'Consumer',
    'order.washer': 'Washer',
    'order.total': 'Total',
    'order.noOrder': 'No order',
    'orderActions.cancel.button': 'Cancel order',
    'orderActions.complete.button': 'Mark complete',
    'orderActions.cancel.confirmTitle': 'Confirm cancel',
    'orderActions.cancel.confirmBody': 'This will cancel the order.',
    'orderActions.cancel.confirmNo': 'No',
    'orderActions.cancel.confirmYes': 'Yes, cancel',
    'orderActions.complete.confirmTitle': 'Confirm complete',
    'orderActions.complete.confirmBody': 'This will mark the order complete.',
    'orderActions.complete.confirmNo': 'No',
    'orderActions.complete.confirmYes': 'Yes, complete',
    'orderActions.error': 'Action failed',
    'orderActions.toasts.cancelled': 'Cancelled',
    'orderActions.toasts.completed': 'Completed',
  } } },
  lng: 'en', fallbackLng: 'en',
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

describe('OrderPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "no order" message when orderId is null', () => {
    render(<OrderPanel orderId={null} conversationStatus="open" />, { wrapper })
    expect(screen.getByText(/no order/i)).toBeInTheDocument()
  })

  it('renders status pill matching order.status', async () => {
    render(<OrderPanel orderId="order-uuid-1234" conversationStatus="open" />, { wrapper })
    await waitFor(() => expect(screen.getByText('accepted')).toBeInTheDocument())
  })

  it('renders Cancel and Mark Complete buttons for non-terminal order/conv', async () => {
    render(<OrderPanel orderId="order-uuid-1234" conversationStatus="open" />, { wrapper })
    await waitFor(() => expect(screen.getByRole('button', { name: /cancel order/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument()
  })

  it('calls transition_order_status with "cancelled" on cancel confirmation', async () => {
    const { supabase } = await import('../lib/supabase.js')
    supabase.rpc.mockResolvedValueOnce({ error: null })
    render(<OrderPanel orderId="order-uuid-1234" conversationStatus="open" />, { wrapper })
    await waitFor(() => screen.getByRole('button', { name: /cancel order/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel order/i }))
    await waitFor(() => screen.getByText(/confirm cancel/i))
    fireEvent.click(screen.getByRole('button', { name: /yes, cancel/i }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('transition_order_status', {
      order_id: 'order-uuid-1234',
      new_status: 'cancelled',
    }))
  })

  it('subscribes to realtime on mount and unsubscribes on unmount', async () => {
    const { supabase } = await import('../lib/supabase.js')
    const { unmount } = render(<OrderPanel orderId="order-uuid-1234" conversationStatus="open" />, { wrapper })
    expect(supabase.channel).toHaveBeenCalledWith('order-panel-order-uuid-1234')
    unmount()
    expect(supabase.removeChannel).toHaveBeenCalled()
  })
})
