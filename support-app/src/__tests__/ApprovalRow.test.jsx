import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

vi.mock('../lib/approvals.js', () => ({
  approveOrder: vi.fn().mockResolvedValue({ error: null }),
  getSignedUrl: vi.fn().mockImplementation((path) =>
    path ? Promise.resolve(`https://cdn.example.com/${path}`) : Promise.resolve(null)
  ),
}))

vi.mock('../lib/geocode.js', () => ({
  useReverseGeocode: vi.fn().mockReturnValue('Habarzel 23, Tel Aviv'),
}))

// MiniMap is lazy — mock it synchronously
vi.mock('../components/MiniMap.jsx', () => ({
  default: () => <div data-testid="mini-map" />,
}))

import ApprovalRow from '../components/ApprovalRow.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'approvals.actions.approve': 'Approve',
    'approvals.actions.reject': 'Reject',
    'approvals.actions.confirmTitle': 'Confirm?',
    'approvals.actions.confirmNo': 'No',
    'approvals.actions.confirmYes': 'Yes',
    'approvals.section.arrival': 'Arrival',
    'approvals.section.completion': 'Completion',
    'approvals.photoSlots.front': 'Front',
    'approvals.photoSlots.back': 'Rear',
    'approvals.photoSlots.driver': 'Driver',
    'approvals.photoSlots.passenger': 'Passenger',
    'approvals.location.title': 'Washer location',
    'approvals.location.notRecorded': 'Not recorded',
    'approvals.location.distance': '{{distance}}m',
    'approvals.location.submittedAt': 'Submitted {{time}}',
    'approvals.row.pendingApproval': 'Pending approval',
    'approvals.row.videoBefore': 'Before',
    'approvals.row.videoAfter': 'After',
  } } },
  lng: 'en', fallbackLng: 'en',
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

function makeOrder(overrides = {}) {
  return {
    id: 'order-abc123-xyz',
    status: 'pending_approval',
    car_plate: '48-271-95',
    car_make: 'Toyota',
    car_model: 'Corolla',
    car_year: 2021,
    car_color: 'White',
    consumer_profile: { full_name: 'Noa Avraham' },
    washer_profile: { full_name: 'Yossi Mizrahi' },
    accepted_at: new Date(Date.now() - 600_000).toISOString(),
    submitted_lat: null,
    submitted_lng: null,
    lat: null,
    lng: null,
    // New shape photo fields
    arrival_photo_front: 'arrival/front.jpg',
    arrival_photo_back: 'arrival/back.jpg',
    arrival_photo_driver: 'arrival/driver.jpg',
    arrival_photo_passenger: 'arrival/passenger.jpg',
    completion_photo_front: 'completion/front.jpg',
    completion_photo_back: 'completion/back.jpg',
    completion_photo_driver: 'completion/driver.jpg',
    completion_photo_passenger: 'completion/passenger.jpg',
    ...overrides,
  }
}

describe('ApprovalRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders 4 arrival photo slots and 4 completion photo slots', async () => {
    render(<ApprovalRow order={makeOrder()} onApproved={vi.fn()} />, { wrapper })
    await waitFor(() => {
      expect(screen.getByText('Arrival')).toBeInTheDocument()
      expect(screen.getByText('Completion')).toBeInTheDocument()
    })
    // 4 slot labels per section × 2 sections = 8 photo labels
    const frontLabels = screen.getAllByText('Front')
    expect(frontLabels).toHaveLength(2)
  })

  it('requests a signed URL for each photo path', async () => {
    const { getSignedUrl } = await import('../lib/approvals.js')
    render(<ApprovalRow order={makeOrder()} onApproved={vi.fn()} />, { wrapper })
    await waitFor(() => {
      // 8 paths total (4 arrival + 4 completion)
      expect(getSignedUrl).toHaveBeenCalledTimes(8)
    })
  })

  it('renders the Approve button', () => {
    render(<ApprovalRow order={makeOrder()} onApproved={vi.fn()} />, { wrapper })
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
  })

  it('calls approveOrder on confirmation and calls onApproved', async () => {
    const { approveOrder } = await import('../lib/approvals.js')
    const onApproved = vi.fn()
    render(<ApprovalRow order={makeOrder()} onApproved={onApproved} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    await waitFor(() => screen.getByText(/confirm\?/i))
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i }))
    await waitFor(() => {
      expect(approveOrder).toHaveBeenCalledWith('order-abc123-xyz')
      expect(onApproved).toHaveBeenCalledWith('order-abc123-xyz')
    })
  })
})
