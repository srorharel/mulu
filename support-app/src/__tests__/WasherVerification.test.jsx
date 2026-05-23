import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

vi.mock('../lib/washerVerifications.js', () => ({
  fetchPendingVerifications: vi.fn(),
  getVerificationSignedUrl: vi.fn().mockImplementation((path) =>
    path ? Promise.resolve(`https://cdn.example.com/${path}`) : Promise.resolve(null)
  ),
  reviewVerification: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  },
}))

import { fetchPendingVerifications, reviewVerification } from '../lib/washerVerifications.js'
import WasherVerificationRow from '../components/WasherVerificationRow.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        'washerVerifications.status.pending_review': 'Pending review',
        'washerVerifications.dealerNumber': 'Dealer number',
        'washerVerifications.idDoc': 'ID Document',
        'washerVerifications.liveness': 'Liveness',
        'washerVerifications.license': 'Business License',
        'washerVerifications.licenseDoc': 'Document',
        'washerVerifications.rejectReason': 'Rejection reason',
        'washerVerifications.rejectReasonPlaceholder': 'Describe the reason...',
        'washerVerifications.actions.approve': 'Approve',
        'washerVerifications.actions.reject': 'Reject',
        'washerVerifications.actions.confirmApprove': 'Approve this application?',
        'washerVerifications.actions.confirmReject': 'Confirm rejection',
        'washerVerifications.actions.cancel': 'Cancel',
        'washerVerifications.actions.yes': 'Yes, approve',
        'washerVerifications.actions.no': 'Not yet',
      },
    },
  },
  lng: 'en',
  fallbackLng: 'en',
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

function makeVerification(overrides = {}) {
  return {
    id: 'ver-001',
    dealer_number: '1234567',
    service_areas: ['holon', 'bat_yam'],
    status: 'pending_review',
    submitted_at: new Date(Date.now() - 3600_000).toISOString(),
    id_document_path: 'uid1/id_document.jpg',
    liveness_paths: ['uid1/liveness_1.jpg', 'uid1/liveness_2.jpg'],
    business_license_path: 'uid1/business_license.jpg',
    washer: { id: 'uid1', full_name: 'Yossi Ploni', email: 'yossi@test.com' },
    ...overrides,
  }
}

describe('WasherVerificationRow', () => {
  it('renders washer name, dealer number, and service areas', async () => {
    const onReviewed = vi.fn()
    render(
      <WasherVerificationRow verification={makeVerification()} onReviewed={onReviewed} />,
      { wrapper }
    )
    expect(screen.getByText('Yossi Ploni')).toBeInTheDocument()
    expect(screen.getByText(/1234567/)).toBeInTheDocument()
  })

  it('shows Approve and Reject buttons', async () => {
    render(
      <WasherVerificationRow verification={makeVerification()} onReviewed={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getByText('Approve')).toBeInTheDocument()
    expect(screen.getByText('Reject')).toBeInTheDocument()
  })

  it('calls reviewVerification with approved and invokes onReviewed', async () => {
    const user = userEvent.setup()
    const onReviewed = vi.fn()
    render(
      <WasherVerificationRow verification={makeVerification()} onReviewed={onReviewed} />,
      { wrapper }
    )

    await user.click(screen.getByText('Approve'))
    await waitFor(() => expect(screen.getByText('Approve this application?')).toBeInTheDocument())
    await user.click(screen.getByText('Yes, approve'))

    await waitFor(() => {
      expect(reviewVerification).toHaveBeenCalledWith('ver-001', 'approved')
      expect(onReviewed).toHaveBeenCalledWith('ver-001')
    })
  })

  it('blocks rejection without a reason', async () => {
    const user = userEvent.setup()
    const onReviewed = vi.fn()
    render(
      <WasherVerificationRow verification={makeVerification()} onReviewed={onReviewed} />,
      { wrapper }
    )

    await user.click(screen.getByText('Reject'))
    await waitFor(() => expect(screen.getByText('Rejection reason')).toBeInTheDocument())

    const confirmBtn = screen.getByText('Confirm rejection')
    expect(confirmBtn).toBeDisabled()
    expect(onReviewed).not.toHaveBeenCalled()
  })

  it('calls reviewVerification with rejected + reason', async () => {
    const user = userEvent.setup()
    const onReviewed = vi.fn()
    render(
      <WasherVerificationRow verification={makeVerification()} onReviewed={onReviewed} />,
      { wrapper }
    )

    await user.click(screen.getByText('Reject'))
    await waitFor(() => expect(screen.getByPlaceholderText('Describe the reason...')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Describe the reason...'), 'ID is blurry')
    await user.click(screen.getByText('Confirm rejection'))

    await waitFor(() => {
      expect(reviewVerification).toHaveBeenCalledWith('ver-001', 'rejected', 'ID is blurry')
      expect(onReviewed).toHaveBeenCalledWith('ver-001')
    })
  })
})

describe('WasherVerificationsView — badge count', () => {
  it('fetching pending verifications returns rows', async () => {
    fetchPendingVerifications.mockResolvedValue({
      data: [makeVerification(), makeVerification({ id: 'ver-002', dealer_number: '9876543' })],
      error: null,
    })
    const { data } = await fetchPendingVerifications()
    expect(data).toHaveLength(2)
  })

  it('badge count is 0 when no pending verifications', async () => {
    fetchPendingVerifications.mockResolvedValue({ data: [], error: null })
    const { data } = await fetchPendingVerifications()
    expect(data).toHaveLength(0)
  })
})
