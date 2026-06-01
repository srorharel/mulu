import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import i18next from 'i18next'

vi.mock('../lib/approvals.js', () => ({
  approveOrder: vi.fn().mockResolvedValue({ error: null }),
  declineOrder: vi.fn().mockResolvedValue({ error: null }),
  getSignedUrl: vi.fn().mockImplementation((p) => Promise.resolve(p ? `https://cdn/${p}` : null)),
}))
vi.mock('../lib/geocode.js', () => ({ useReverseGeocode: vi.fn().mockReturnValue('Somewhere') }))
vi.mock('../components/MiniMap.jsx', () => ({ default: () => <div data-testid="mini-map" /> }))

import ApprovalRow from '../components/ApprovalRow.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'approvals.location.title': 'Submission location',
    'approvals.location.notRecorded': 'Location not recorded',
    'approvals.location.underground': 'Location unavailable (underground)',
    'approvals.location.submittedAt': 'Submitted {{time}}',
    'approvals.location.distance': '{{distance}}m',
    'approvals.actions.approve': 'Approve',
    'approvals.actions.reject': 'Reject',
    'approvals.section.arrival': 'Arrival',
    'approvals.section.completion': 'Completion',
    'approvals.photoSlots.front': 'Front', 'approvals.photoSlots.back': 'Back',
    'approvals.photoSlots.driver': 'Driver', 'approvals.photoSlots.passenger': 'Passenger',
    'approvals.row.pendingApproval': 'Pending approval',
  } } },
  lng: 'en', fallbackLng: 'en',
})

const wrapper = ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>

function makeOrder(overrides = {}) {
  return {
    id: 'o-1', status: 'pending_approval',
    consumer_profile: { full_name: 'Noa' }, washer_profile: { full_name: 'Yossi' },
    accepted_at: new Date(Date.now() - 600_000).toISOString(),
    submitted_lat: null, submitted_lng: null, lat: 32.08, lng: 34.78,
    arrival_photo_front: 'a/f.jpg', arrival_photo_back: 'a/b.jpg',
    arrival_photo_driver: 'a/d.jpg', arrival_photo_passenger: 'a/p.jpg',
    completion_photo_front: 'c/f.jpg', completion_photo_back: 'c/b.jpg',
    completion_photo_driver: 'c/d.jpg', completion_photo_passenger: 'c/p.jpg',
    is_underground_parking: false,
    ...overrides,
  }
}

describe('ApprovalRow — underground location card', () => {
  it('shows "Location unavailable (underground)" and NO map for a marked order with null coords', async () => {
    render(<ApprovalRow order={makeOrder({ is_underground_parking: true })} onApproved={vi.fn()} />, { wrapper })
    await waitFor(() => {
      expect(screen.getByText('Location unavailable (underground)')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('mini-map')).not.toBeInTheDocument()
    expect(screen.queryByText('Location not recorded')).not.toBeInTheDocument()
  })

  it('renders the normal GPS map for a non-underground order with submitted coords', async () => {
    render(
      <ApprovalRow
        order={makeOrder({ is_underground_parking: false, submitted_lat: 32.07, submitted_lng: 34.79 })}
        onApproved={vi.fn()}
      />,
      { wrapper },
    )
    await waitFor(() => {
      expect(screen.getByTestId('mini-map')).toBeInTheDocument()
    })
    expect(screen.queryByText('Location unavailable (underground)')).not.toBeInTheDocument()
  })
})
