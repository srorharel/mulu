import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import i18next from 'i18next'

const rpc = vi.fn().mockResolvedValue({ error: null })
const fetchOrderDetails = vi.fn()

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
    removeChannel: vi.fn(),
    rpc: (...a) => rpc(...a),
  },
}))
vi.mock('../lib/support.js', () => ({ fetchOrderDetails: (...a) => fetchOrderDetails(...a) }))
vi.mock('../lib/geocode.js', () => ({ useReverseGeocode: () => 'Somewhere' }))
vi.mock('../components/MiniMap.jsx', () => ({ default: () => <div data-testid="mini-map" /> }))

import OrderPanel from '../components/OrderPanel.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    order: { linkedOrder: 'Linked order', consumer: 'Customer', washer: 'Washer', address: 'Address', pricing: 'Pricing', consumerTotal: 'Consumer total', washerPayout: 'Washer payout', noOrder: 'No order' },
    orderStatus: { accepted: 'Accepted', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' },
    orderActions: {
      cancel:   { button: 'Cancel order' },
      complete: { button: 'Mark complete' },
      underground: {
        mark: 'Mark as underground', unmark: 'Unmark underground', badge: 'Underground',
        confirmTitle: 'Change underground status?',
        confirmBodyMark: 'Switches to offline capture.',
        confirmBodyUnmark: 'Requires GPS again.',
        confirmYes: 'Yes, change', confirmNo: 'Cancel',
      },
      toasts: { cancelled: 'Cancelled', completed: 'Completed', marked: 'Order marked as underground', regular: 'Order set back to regular' },
      error: 'Action failed',
    },
  } } },
  lng: 'en', fallbackLng: 'en',
})

const wrapper = ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>

function order(overrides = {}) {
  return {
    id: 'order-uuid-1234', status: 'in_progress', total_price: 100, payout_amount: 60,
    car_plate: '48-271-95', address_label: 'Habarzel 23',
    consumer: { full_name: 'Noa', phone: '+972500000001' },
    washer: { full_name: 'Yossi', phone: '+972500000002', is_online: true },
    is_underground_parking: false,
    ...overrides,
  }
}

beforeEach(() => {
  rpc.mockClear()
  fetchOrderDetails.mockReset()
})

describe('OrderPanel — agent underground toggle', () => {
  it('marks a regular order as underground via agent_set_order_underground(true)', async () => {
    fetchOrderDetails.mockResolvedValue({ data: order({ is_underground_parking: false }) })
    render(<OrderPanel orderId="order-uuid-1234" conversationStatus="assigned" openerRole="consumer" />, { wrapper })

    const markBtn = await screen.findByRole('button', { name: /mark as underground/i })
    fireEvent.click(markBtn)
    fireEvent.click(await screen.findByRole('button', { name: /yes, change/i }))

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith('agent_set_order_underground', { p_order_id: 'order-uuid-1234', p_value: true })
    })
  })

  it('shows the Underground badge + an Unmark action for an already-marked order', async () => {
    fetchOrderDetails.mockResolvedValue({ data: order({ is_underground_parking: true }) })
    render(<OrderPanel orderId="order-uuid-1234" conversationStatus="assigned" openerRole="consumer" />, { wrapper })

    expect(await screen.findByText('Underground')).toBeInTheDocument()
    const unmarkBtn = await screen.findByRole('button', { name: /unmark underground/i })
    fireEvent.click(unmarkBtn)
    fireEvent.click(await screen.findByRole('button', { name: /yes, change/i }))

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith('agent_set_order_underground', { p_order_id: 'order-uuid-1234', p_value: false })
    })
  })

  it('hides agent actions for a terminal order', async () => {
    fetchOrderDetails.mockResolvedValue({ data: order({ status: 'completed' }) })
    render(<OrderPanel orderId="order-uuid-1234" conversationStatus="assigned" openerRole="consumer" />, { wrapper })
    await screen.findByText('Linked order')
    expect(screen.queryByRole('button', { name: /mark as underground/i })).not.toBeInTheDocument()
  })
})
