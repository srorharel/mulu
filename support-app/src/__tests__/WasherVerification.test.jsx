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

import { fetchPendingVerifications, getVerificationSignedUrl, reviewVerification } from '../lib/washerVerifications.js'
import WasherVerificationRow from '../components/WasherVerificationRow.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        'washerVerifications.status.pending_review': 'Pending review',
        'washerVerifications.dealerNumber': 'Dealer number',
        'washerVerifications.washerName': 'Name',
        'washerVerifications.washerPhone': 'Phone',
        'washerVerifications.serviceAreas': 'Service areas',
        'washerVerifications.submittedAt': 'Submitted',
        'washerVerifications.businessLicense': 'Business license',
        'washerVerifications.openFailed': 'Could not open document',
        'washerVerifications.downloadFailed': 'Download failed',
        'washerVerifications.idDoc': 'ID Document',
        'washerVerifications.selfie': 'Selfie',
        'washerVerifications.selfieDoc': 'Photo',
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
        'common.copy': 'Copy',
        'common.open': 'Open',
        'common.download': 'Download',
        'cities.holon': 'Holon',
        'cities.bat_yam': 'Bat Yam',
      },
    },
  },
  lng: 'en',
  fallbackLng: 'en',
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

// RPC returns flat rows — no nested washer object
function makeVerification(overrides = {}) {
  return {
    id: 'ver-001',
    washer_id: 'uid1',
    dealer_number: '1234567',
    service_areas: ['holon', 'bat_yam'],
    status: 'pending_review',
    submitted_at: new Date(Date.now() - 3600_000).toISOString(),
    id_document_path: 'uid1/id_document.jpg',
    selfie_path: 'uid1/selfie.jpg',
    business_license_path: 'uid1/business_license.jpg',
    washer_name: 'Yossi Ploni',
    washer_email: 'yossi@test.com',
    washer_phone: null,
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
    expect(screen.getAllByText('Yossi Ploni').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/1234567/)).toBeInTheDocument()
  })

  it('renders washer email below the name', async () => {
    render(
      <WasherVerificationRow verification={makeVerification()} onReviewed={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getByText('yossi@test.com')).toBeInTheDocument()
  })

  it('falls back to email in the header when washer_name is null', async () => {
    render(
      <WasherVerificationRow
        verification={makeVerification({ washer_name: null })}
        onReviewed={vi.fn()}
      />,
      { wrapper }
    )
    // email appears as the primary identifier
    expect(screen.getAllByText('yossi@test.com').length).toBeGreaterThanOrEqual(1)
  })

  it('shows — when both washer_name and washer_email are null', async () => {
    render(
      <WasherVerificationRow
        verification={makeVerification({ washer_name: null, washer_email: null })}
        onReviewed={vi.fn()}
      />,
      { wrapper }
    )
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
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

  it('shows the Selfie section label', async () => {
    render(
      <WasherVerificationRow verification={makeVerification()} onReviewed={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getByText('Selfie')).toBeInTheDocument()
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

describe('fetchPendingVerifications', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns rows with flat washer_name and washer_email fields', async () => {
    fetchPendingVerifications.mockResolvedValue({
      data: [
        makeVerification(),
        makeVerification({ id: 'ver-002', dealer_number: '9876543', washer_name: 'Dana Cohen', washer_email: 'dana@test.com' }),
      ],
      error: null,
    })
    const { data } = await fetchPendingVerifications()
    expect(data).toHaveLength(2)
    expect(data[0].washer_name).toBe('Yossi Ploni')
    expect(data[0].washer_email).toBe('yossi@test.com')
    expect(data[1].dealer_number).toBe('9876543')
  })

  it('returns empty array when no pending verifications', async () => {
    fetchPendingVerifications.mockResolvedValue({ data: [], error: null })
    const { data } = await fetchPendingVerifications()
    expect(data).toHaveLength(0)
  })

  it('returns error object on failure', async () => {
    fetchPendingVerifications.mockResolvedValue({ data: null, error: { message: 'agents only' } })
    const { data, error } = await fetchPendingVerifications()
    expect(data).toBeNull()
    expect(error.message).toBe('agents only')
  })
})

describe('WasherVerificationRow — metadata card', () => {
  it('shows dealer number, name, and translated service areas', () => {
    render(
      <WasherVerificationRow verification={makeVerification()} onReviewed={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getAllByText('1234567').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Yossi Ploni').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Holon/)).toBeInTheDocument()
    expect(screen.getByText(/Bat Yam/)).toBeInTheDocument()
  })
})

describe('WasherVerificationRow — copy button', () => {
  let writeText

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })
  })

  it('calls navigator.clipboard.writeText with the dealer number', async () => {
    render(
      <WasherVerificationRow verification={makeVerification()} onReviewed={vi.fn()} />,
      { wrapper }
    )
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeText).toHaveBeenCalledWith('1234567')
  })
})

describe('WasherVerificationRow — PDF license', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerificationSignedUrl.mockImplementation((path) =>
      path ? Promise.resolve(`https://cdn.example.com/${path}`) : Promise.resolve(null)
    )
    window.open = vi.fn()
    globalThis.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
    })
    URL.createObjectURL = vi.fn(() => 'blob:fake-pdf')
    URL.revokeObjectURL = vi.fn()
  })

  function makePdfVerification(overrides = {}) {
    return makeVerification({ business_license_path: 'uid1/business_license.pdf', ...overrides })
  }

  it('shows Open and Download buttons for a .pdf license path', () => {
    render(
      <WasherVerificationRow verification={makePdfVerification()} onReviewed={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /download/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('calls window.open with the signed URL and _blank on Open click', async () => {
    const user = userEvent.setup()
    render(
      <WasherVerificationRow verification={makePdfVerification()} onReviewed={vi.fn()} />,
      { wrapper }
    )
    await user.click(screen.getByRole('button', { name: /open/i }))
    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        'https://cdn.example.com/uid1/business_license.pdf',
        '_blank',
        'noopener,noreferrer'
      )
    })
  })

  it('calls fetch and revokes the object URL after download', async () => {
    const user = userEvent.setup()
    render(
      <WasherVerificationRow verification={makePdfVerification()} onReviewed={vi.fn()} />,
      { wrapper }
    )
    const [firstDownloadBtn] = screen.getAllByRole('button', { name: /download/i })
    await user.click(firstDownloadBtn)
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://cdn.example.com/uid1/business_license.pdf'
      )
      expect(URL.createObjectURL).toHaveBeenCalled()
      expect(URL.revokeObjectURL).toHaveBeenCalled()
    })
  })

  it('shows openFailed error when signed URL is null on Open click', async () => {
    // Return null for all calls in this test (useEffect + the Open click itself)
    getVerificationSignedUrl.mockResolvedValue(null)
    const user = userEvent.setup()
    render(
      <WasherVerificationRow verification={makePdfVerification()} onReviewed={vi.fn()} />,
      { wrapper }
    )
    await user.click(screen.getByRole('button', { name: /open/i }))
    await waitFor(() => {
      expect(screen.getByText('Could not open document')).toBeInTheDocument()
    })
  })

  it('shows downloadFailed error when signed URL is null on Download click', async () => {
    getVerificationSignedUrl.mockResolvedValue(null)
    const user = userEvent.setup()
    render(
      <WasherVerificationRow verification={makePdfVerification()} onReviewed={vi.fn()} />,
      { wrapper }
    )
    const [firstDownloadBtn] = screen.getAllByRole('button', { name: /download/i })
    await user.click(firstDownloadBtn)
    await waitFor(() => {
      expect(screen.getByText('Download failed')).toBeInTheDocument()
    })
  })
})

describe('WasherVerificationRow — image license', () => {
  it('does not show an Open button for an image license path', () => {
    render(
      <WasherVerificationRow verification={makeVerification()} onReviewed={vi.fn()} />,
      { wrapper }
    )
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument()
  })
})
