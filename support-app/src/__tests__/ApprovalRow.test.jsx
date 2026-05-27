import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

const approveOrderMock = vi.fn().mockResolvedValue({ error: null })
const declineOrderMock = vi.fn().mockResolvedValue({ error: null })

vi.mock('../lib/approvals.js', () => ({
  approveOrder: (...args) => approveOrderMock(...args),
  declineOrder: (...args) => declineOrderMock(...args),
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
    'approvals.actions.declineTitle': 'Decline — reason required',
    'approvals.actions.declinePlaceholder': 'Describe what needs to be fixed...',
    'approvals.actions.declineConfirm': 'Decline',
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
    approveOrderMock.mockResolvedValue({ error: null })
    declineOrderMock.mockResolvedValue({ error: null })
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

  it('both buttons exist with distinct accessible names', () => {
    render(<ApprovalRow order={makeOrder()} onApproved={vi.fn()} />, { wrapper })
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  })

  it('both buttons have type="button"', () => {
    render(<ApprovalRow order={makeOrder()} onApproved={vi.fn()} />, { wrapper })
    const approve = screen.getByRole('button', { name: /approve/i })
    const reject = screen.getByRole('button', { name: /reject/i })
    expect(approve).toHaveAttribute('type', 'button')
    expect(reject).toHaveAttribute('type', 'button')
  })

  it('approve button calls approveOrder and NOT declineOrder', async () => {
    const onApproved = vi.fn()
    render(<ApprovalRow order={makeOrder()} onApproved={onApproved} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    await waitFor(() => screen.getByText(/confirm\?/i))
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i }))
    await waitFor(() => {
      expect(approveOrderMock).toHaveBeenCalledWith('order-abc123-xyz')
      expect(onApproved).toHaveBeenCalledWith('order-abc123-xyz')
    })
    expect(declineOrderMock).not.toHaveBeenCalled()
  })

  it('reject button opens decline form with reason textarea', async () => {
    render(<ApprovalRow order={makeOrder()} onApproved={vi.fn()} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))
    await waitFor(() => {
      expect(screen.getByText(/decline.*reason/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/describe what needs/i)).toBeInTheDocument()
    })
  })

  it('decline button calls declineOrder and NOT approveOrder', async () => {
    const onApproved = vi.fn()
    render(<ApprovalRow order={makeOrder()} onApproved={onApproved} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))
    await waitFor(() => screen.getByPlaceholderText(/describe what needs/i))
    const textarea = screen.getByPlaceholderText(/describe what needs/i)
    fireEvent.change(textarea, { target: { value: 'Photos are too blurry to verify' } })
    fireEvent.click(screen.getByRole('button', { name: /^decline$/i }))
    await waitFor(() => {
      expect(declineOrderMock).toHaveBeenCalledWith('order-abc123-xyz', 'Photos are too blurry to verify')
      expect(onApproved).toHaveBeenCalledWith('order-abc123-xyz')
    })
    expect(approveOrderMock).not.toHaveBeenCalled()
  })

  it('decline is disabled when reason is too short', async () => {
    render(<ApprovalRow order={makeOrder()} onApproved={vi.fn()} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))
    await waitFor(() => screen.getByPlaceholderText(/describe what needs/i))
    const textarea = screen.getByPlaceholderText(/describe what needs/i)
    fireEvent.change(textarea, { target: { value: 'ab' } })
    expect(screen.getByRole('button', { name: /^decline$/i })).toBeDisabled()
  })

  it('clicking reject does not bubble to a parent onClick', async () => {
    const parentClick = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <div onClick={parentClick}>
          <ApprovalRow order={makeOrder()} onApproved={vi.fn()} />
        </div>
      </I18nextProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))
    await new Promise((r) => setTimeout(r, 10))
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('disables both buttons while approve is busy', async () => {
    let resolveRpc
    approveOrderMock.mockImplementationOnce(() => new Promise((r) => { resolveRpc = r }))
    render(<ApprovalRow order={makeOrder()} onApproved={vi.fn()} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    await waitFor(() => screen.getByText(/confirm\?/i))
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i }))
    await waitFor(() => {
      const yesBtn = screen.getByRole('button', { name: /^…$/ })
      expect(yesBtn).toBeDisabled()
    })
    resolveRpc({ error: null })
  })
})
