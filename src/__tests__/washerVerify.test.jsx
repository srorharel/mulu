import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

// ── Hoisted mocks ─────────────────────────────────────────────────────────
const { mockUpload, mockInsert, mockUpdateEq, mockRemove } = vi.hoisted(() => ({
  mockUpload:   vi.fn().mockResolvedValue({ error: null }),
  mockInsert:   vi.fn().mockResolvedValue({ error: null }),
  mockUpdateEq: vi.fn().mockResolvedValue({ error: null }),
  mockRemove:   vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    storage: { from: () => ({ upload: mockUpload, remove: mockRemove }) },
    from: () => ({
      insert: mockInsert,
      update: () => ({ eq: mockUpdateEq }),
    }),
  },
}))

const mockSignOut = vi.fn().mockResolvedValue(undefined)
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { id: 'uid-test' },
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    signOut: mockSignOut,
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate, useLocation: () => ({ state: null }) }
})

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })) },
}))

vi.mock('../lib/imageResize.js', () => ({ resizeToBlob: (f) => Promise.resolve(f) }))

// Mock the selfie modal so Verify.jsx tests don't need a real camera.
// Simulates instant successful capture when the "mock-capture" button is clicked.
vi.mock('../components/washer/SelfieVerificationModal.jsx', () => ({
  default: ({ userId, onCapture, onClose }) => (
    <div data-testid="selfie-modal">
      <button
        type="button"
        data-testid="mock-capture-btn"
        onClick={() => onCapture('blob:fake-selfie', `${userId}/selfie.jpg`)}
      >
        mock-capture
      </button>
      <button type="button" data-testid="mock-close-btn" onClick={onClose}>
        close
      </button>
    </div>
  ),
}))

import Verify from '../pages/washer/Verify.jsx'

// ── i18n setup ────────────────────────────────────────────────────────────
const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        'washerSignup.verify.title': 'Verify your identity',
        'washerSignup.verify.subtitle': 'Required to start accepting jobs',
        'washerSignup.verify.sectionId.title': "ID / driver's license",
        'washerSignup.verify.sectionId.hint': 'Take a clear photo of your ID',
        'washerSignup.verify.sectionId.upload': 'Upload photo',
        'washerSignup.verify.sectionId.uploaded': 'ID uploaded',
        'washerSignup.verify.sectionId.change': 'Change photo',
        'washerSignup.verify.sectionSelfie.title': 'Selfie verification',
        'washerSignup.verify.sectionSelfie.hint': "We'll verify your face using your camera",
        'washerSignup.verify.sectionSelfie.start': 'Start verification',
        'washerSignup.verify.sectionSelfie.verified': 'Selfie verified',
        'washerSignup.verify.sectionSelfie.retake': 'Retake',
        'washerSignup.verify.sectionSelfie.positioning': 'Position your face in the frame',
        'washerSignup.verify.sectionSelfie.hold': 'Hold still...',
        'washerSignup.verify.sectionSelfie.captured': 'Captured',
        'washerSignup.verify.sectionSelfie.unsupported': 'Face verification not supported on this device.',
        'washerSignup.verify.sectionSelfie.permissionDenied': 'Camera permission required',
        'washerSignup.verify.sectionSelfie.cancel': 'Cancel',
        'washerSignup.verify.sectionLicense.title': 'Certificate of Licensed Dealer',
        'washerSignup.verify.sectionLicense.hint': 'Upload your business license',
        'washerSignup.verify.sectionLicense.upload': 'Upload document',
        'washerSignup.verify.sectionLicense.uploaded': 'License uploaded',
        'washerSignup.verify.sectionLicense.change': 'Change document',
        'washerSignup.verify.sectionLicense.pdfOnly': 'Please upload a PDF file',
        'washerSignup.verify.submit': 'Submit for review',
        'washerSignup.verify.submitting': 'Submitting…',
        'washerSignup.verify.submitError': 'Submission failed. Please try again.',
        'washerSignup.verify.discardWarning': 'Going back will discard your uploaded documents. Continue?',
        'common.back': 'Back',
      },
    },
  },
  lng: 'en',
  fallbackLng: 'en',
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    <MemoryRouter>{children}</MemoryRouter>
  </I18nextProvider>
)

// ── File input helpers ────────────────────────────────────────────────────
function makeFile(name = 'photo.jpg', type = 'image/jpeg') {
  return new File(['fake-image'], name, { type })
}

function uploadToInput(inputEl, file) {
  Object.defineProperty(inputEl, 'files', { value: [file], configurable: true })
  fireEvent.change(inputEl)
}

function getIdInput()      { return document.querySelector('input[accept="image/*"]') }
function getLicenseInput() { return document.querySelector('input[accept="application/pdf"]') }

// Simulate opening the modal and triggering a successful capture
async function triggerSelfieCapture() {
  await userEvent.setup().click(screen.getByRole('button', { name: /Start verification/i }))
  await userEvent.setup().click(screen.getByTestId('mock-capture-btn'))
  await waitFor(() => expect(screen.getByText('Selfie verified')).toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpload.mockResolvedValue({ error: null })
  mockInsert.mockResolvedValue({ error: null })
  mockUpdateEq.mockResolvedValue({ error: null })
  mockRemove.mockResolvedValue({ error: null })
  mockSignOut.mockResolvedValue(undefined)
  URL.createObjectURL = vi.fn(() => 'blob:fake-url')
  URL.revokeObjectURL = vi.fn()
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Verify page — structure', () => {
  it('renders exactly three section headers with correct labels', () => {
    render(<Verify />, { wrapper })
    expect(screen.getByText("ID / driver's license")).toBeInTheDocument()
    expect(screen.getByText('Selfie verification')).toBeInTheDocument()
    expect(screen.getByText('Certificate of Licensed Dealer')).toBeInTheDocument()
  })

  it('has no liveness-check text anywhere on the page', () => {
    render(<Verify />, { wrapper })
    expect(screen.queryByText(/liveness/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/No camera found/i)).not.toBeInTheDocument()
  })

  it('section B badge letter is B, section C badge is C, no duplicate B', () => {
    render(<Verify />, { wrapper })
    expect(screen.getAllByText('B')).toHaveLength(1)
    expect(screen.getAllByText('C')).toHaveLength(1)
  })

  it('submit button is disabled when no sections are complete', () => {
    render(<Verify />, { wrapper })
    expect(screen.getByRole('button', { name: /Submit for review/i })).toBeDisabled()
  })

  it('"Start verification" button is visible before selfie is captured', () => {
    render(<Verify />, { wrapper })
    expect(screen.getByRole('button', { name: /Start verification/i })).toBeInTheDocument()
  })
})

describe('Verify page — selfie modal flow', () => {
  it('opens the selfie modal when "Start verification" is clicked', async () => {
    render(<Verify />, { wrapper })
    await userEvent.setup().click(screen.getByRole('button', { name: /Start verification/i }))
    expect(screen.getByTestId('selfie-modal')).toBeInTheDocument()
  })

  it('closes the modal without saving when close is clicked', async () => {
    render(<Verify />, { wrapper })
    await userEvent.setup().click(screen.getByRole('button', { name: /Start verification/i }))
    await userEvent.setup().click(screen.getByTestId('mock-close-btn'))
    expect(screen.queryByTestId('selfie-modal')).not.toBeInTheDocument()
    expect(screen.queryByText('Selfie verified')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Submit for review/i })).toBeDisabled()
  })

  it('shows "Selfie verified" and enables submit (with other sections) after successful capture', async () => {
    render(<Verify />, { wrapper })
    uploadToInput(getIdInput(), makeFile('id.jpg'))
    await triggerSelfieCapture()
    uploadToInput(getLicenseInput(), makeFile('license.pdf', 'application/pdf'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Submit for review/i })).not.toBeDisabled()
    )
  })

  it('shows "Retake" link after capture and reopens modal', async () => {
    render(<Verify />, { wrapper })
    await triggerSelfieCapture()
    expect(screen.getByRole('button', { name: /Retake/i })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /Retake/i }))
    expect(screen.getByTestId('selfie-modal')).toBeInTheDocument()
    expect(screen.queryByText('Selfie verified')).not.toBeInTheDocument()
  })
})

describe('Verify page — per-section upload errors', () => {
  async function fillAllSections() {
    uploadToInput(getIdInput(), makeFile('id.jpg'))
    await triggerSelfieCapture()
    uploadToInput(getLicenseInput(), makeFile('license.pdf', 'application/pdf'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Submit for review/i })).not.toBeDisabled()
    )
  }

  it('shows ID upload error inside ID section when ID upload fails', async () => {
    render(<Verify />, { wrapper })
    await fillAllSections()

    mockUpload.mockResolvedValueOnce({ error: { message: 'Storage error' } }) // ID fails

    await userEvent.setup().click(screen.getByRole('button', { name: /Submit for review/i }))

    await waitFor(() => {
      expect(screen.getByText('Storage error')).toBeInTheDocument()
    })
  })

  it('shows license upload error inside license section when license upload fails', async () => {
    render(<Verify />, { wrapper })
    await fillAllSections()

    // ID upload succeeds, license upload returns error
    mockUpload
      .mockResolvedValueOnce({ error: null })                              // ID ok
      .mockResolvedValueOnce({ error: { message: 'Bucket not found' } }) // license fails

    await userEvent.setup().click(screen.getByRole('button', { name: /Submit for review/i }))

    await waitFor(() => {
      expect(screen.getByText('Bucket not found')).toBeInTheDocument()
    })
    // Selfie section still shows verified
    expect(screen.getByText('Selfie verified')).toBeInTheDocument()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('does NOT call supabase insert when upload fails', async () => {
    render(<Verify />, { wrapper })
    await fillAllSections()

    mockUpload.mockResolvedValueOnce({ error: { message: 'Bucket not found' } }) // ID fails

    await userEvent.setup().click(screen.getByRole('button', { name: /Submit for review/i }))

    await waitFor(() => expect(screen.getByText('Bucket not found')).toBeInTheDocument())
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('inserts selfie_path from modal storage path into washer_verifications', async () => {
    render(<Verify />, { wrapper })
    await fillAllSections()

    await userEvent.setup().click(screen.getByRole('button', { name: /Submit for review/i }))

    await waitFor(() => expect(mockInsert).toHaveBeenCalled())
    const insertArg = mockInsert.mock.calls[0][0]
    expect(insertArg.selfie_path).toBe('uid-test/selfie.jpg')
  })
})

describe('Verify page — back button', () => {
  it('renders a back button in the header', () => {
    render(<Verify />, { wrapper })
    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument()
  })

  it('navigates to /signup/washer without confirm when no uploads exist', async () => {
    render(<Verify />, { wrapper })
    await userEvent.setup().click(screen.getByRole('button', { name: /Back/i }))
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/signup/washer', { replace: true })
    })
  })

  it('shows confirm dialog when selfie was uploaded, and navigates on confirm', async () => {
    window.confirm = vi.fn(() => true)
    render(<Verify />, { wrapper })
    await triggerSelfieCapture()
    await userEvent.setup().click(screen.getByRole('button', { name: /Back/i }))
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        'Going back will discard your uploaded documents. Continue?'
      )
      expect(mockRemove).toHaveBeenCalledWith(['uid-test/selfie.jpg'])
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/signup/washer', { replace: true })
    })
  })

  it('stays on page when confirm is cancelled', async () => {
    window.confirm = vi.fn(() => false)
    render(<Verify />, { wrapper })
    await triggerSelfieCapture()
    await userEvent.setup().click(screen.getByRole('button', { name: /Back/i }))
    expect(window.confirm).toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('navigates even when cleanup fails', async () => {
    window.confirm = vi.fn(() => true)
    mockRemove.mockRejectedValueOnce(new Error('network error'))
    render(<Verify />, { wrapper })
    await triggerSelfieCapture()
    await userEvent.setup().click(screen.getByRole('button', { name: /Back/i }))
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/signup/washer', { replace: true })
    })
  })
})

describe('Verify page — PDF-only license upload', () => {
  it('rejects a non-PDF file and shows an error', async () => {
    render(<Verify />, { wrapper })
    uploadToInput(getLicenseInput(), makeFile('license.jpg', 'image/jpeg'))
    await waitFor(() => {
      expect(screen.getByText('Please upload a PDF file')).toBeInTheDocument()
    })
  })

  it('does not enable submit when a non-PDF is uploaded for license', async () => {
    render(<Verify />, { wrapper })
    uploadToInput(getIdInput(), makeFile('id.jpg'))
    await triggerSelfieCapture()
    uploadToInput(getLicenseInput(), makeFile('license.jpg', 'image/jpeg'))
    expect(screen.getByRole('button', { name: /Submit for review/i })).toBeDisabled()
  })

  it('clears the error and enables submit after a valid PDF is uploaded', async () => {
    render(<Verify />, { wrapper })
    uploadToInput(getIdInput(), makeFile('id.jpg'))
    await triggerSelfieCapture()
    uploadToInput(getLicenseInput(), makeFile('license.jpg', 'image/jpeg'))
    await waitFor(() => expect(screen.getByText('Please upload a PDF file')).toBeInTheDocument())

    uploadToInput(getLicenseInput(), makeFile('license.pdf', 'application/pdf'))
    await waitFor(() => {
      expect(screen.queryByText('Please upload a PDF file')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Submit for review/i })).not.toBeDisabled()
    })
  })

  it('uploads the license to a .pdf path regardless of the original filename', async () => {
    render(<Verify />, { wrapper })
    uploadToInput(getIdInput(), makeFile('id.jpg'))
    await triggerSelfieCapture()
    uploadToInput(getLicenseInput(), makeFile('my-bizlicense.pdf', 'application/pdf'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Submit for review/i })).not.toBeDisabled()
    )

    await userEvent.setup().click(screen.getByRole('button', { name: /Submit for review/i }))
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(2))

    const licensePath = mockUpload.mock.calls
      .map(([p]) => p)
      .find((p) => p.includes('business_license'))
    expect(licensePath).toBe('uid-test/business_license.pdf')
  })
})
