import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

// ── Hoisted mocks (must run before imports are resolved) ──────────────────
const { mockDetectFace, mockUpload, mockInsert, mockUpdateEq } = vi.hoisted(() => ({
  mockDetectFace: vi.fn().mockResolvedValue(true),
  mockUpload:     vi.fn().mockResolvedValue({ error: null }),
  mockInsert:     vi.fn().mockResolvedValue({ error: null }),
  mockUpdateEq:   vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('../lib/faceDetect.js', () => ({ detectFaceInImage: mockDetectFace }))

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    storage: { from: () => ({ upload: mockUpload }) },
    from: () => ({
      insert: mockInsert,
      update: () => ({ eq: mockUpdateEq }),
    }),
  },
}))

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { id: 'uid-test' },
    refreshProfile: vi.fn().mockResolvedValue(undefined),
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate, useLocation: () => ({ state: null }) }
})

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/camera', () => ({
  Camera: {},
  CameraResultType: { DataUrl: 'dataUrl' },
  CameraSource: { Camera: 'CAMERA' },
}))

vi.mock('../lib/imageResize.js', () => ({ resizeToBlob: (f) => Promise.resolve(f) }))

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
        'washerSignup.verify.sectionSelfie.title': 'Selfie',
        'washerSignup.verify.sectionSelfie.instruction': 'Take a clear front-facing photo of your face',
        'washerSignup.verify.sectionSelfie.cta': 'Take selfie',
        'washerSignup.verify.sectionSelfie.uploaded': 'Selfie taken',
        'washerSignup.verify.sectionSelfie.retake': 'Retake',
        'washerSignup.verify.sectionSelfie.checking': 'Checking your photo…',
        'washerSignup.verify.sectionSelfie.noFace': 'No face detected. Please take a clear front-facing photo of your face.',
        'washerSignup.verify.sectionSelfie.checkUnavailable': 'Could not verify face. Please try again on a different device or browser.',
        'washerSignup.verify.sectionLicense.title': 'Certificate of Licensed Dealer',
        'washerSignup.verify.sectionLicense.hint': 'Upload your business license',
        'washerSignup.verify.sectionLicense.upload': 'Upload document',
        'washerSignup.verify.sectionLicense.uploaded': 'License uploaded',
        'washerSignup.verify.sectionLicense.change': 'Change document',
        'washerSignup.verify.submit': 'Submit for review',
        'washerSignup.verify.submitting': 'Submitting…',
        'washerSignup.verify.submitError': 'Submission failed. Please try again.',
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

function getIdInput()      { return document.querySelector('input[accept="image/*"]:not([capture])') }
function getSelfieInput()  { return document.querySelector('input[capture="user"]') }
function getLicenseInput() { return document.querySelector('input[accept="image/*,application/pdf"]') }

beforeEach(() => {
  vi.clearAllMocks()
  mockDetectFace.mockResolvedValue(true)
  mockUpload.mockResolvedValue({ error: null })
  mockInsert.mockResolvedValue({ error: null })
  mockUpdateEq.mockResolvedValue({ error: null })
  URL.createObjectURL = vi.fn(() => 'blob:fake-url')
  URL.revokeObjectURL = vi.fn()
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Verify page — structure', () => {
  it('renders exactly three section headers with correct labels', () => {
    render(<Verify />, { wrapper })
    expect(screen.getByText("ID / driver's license")).toBeInTheDocument()
    expect(screen.getByText('Selfie')).toBeInTheDocument()
    expect(screen.getByText('Certificate of Licensed Dealer')).toBeInTheDocument()
  })

  it('has no liveness-check text anywhere on the page', () => {
    render(<Verify />, { wrapper })
    expect(screen.queryByText(/liveness/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Start camera check/i)).not.toBeInTheDocument()
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
})

describe('Verify page — selfie face validation', () => {
  it('accepts selfie and shows "Selfie taken" when face detected', async () => {
    mockDetectFace.mockResolvedValue(true)
    render(<Verify />, { wrapper })

    uploadToInput(getSelfieInput(), makeFile('selfie.jpg'))

    await waitFor(() => {
      expect(screen.getByText('Selfie taken')).toBeInTheDocument()
    })
    expect(mockDetectFace).toHaveBeenCalledWith('blob:fake-url')
  })

  it('shows no-face error and keeps section incomplete when no face found', async () => {
    mockDetectFace.mockResolvedValue(false)
    render(<Verify />, { wrapper })

    uploadToInput(getSelfieInput(), makeFile('wall.jpg'))

    await waitFor(() => {
      expect(screen.getByText(/No face detected/i)).toBeInTheDocument()
    })
    expect(screen.queryByText('Selfie taken')).not.toBeInTheDocument()
    // Submit must remain disabled (selfieFile is null)
    expect(screen.getByRole('button', { name: /Submit for review/i })).toBeDisabled()
  })

  it('clears face error and re-checks when retake is used after failure', async () => {
    mockDetectFace.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<Verify />, { wrapper })

    uploadToInput(getSelfieInput(), makeFile('bad.jpg'))
    await waitFor(() => expect(screen.getByText(/No face detected/i)).toBeInTheDocument())

    // After retake the "Take selfie" button is back (error is visible until retake clears it)
    // The retake is done by re-uploading (face error means selfieFile is null, button is shown)
    uploadToInput(getSelfieInput(), makeFile('good.jpg'))
    await waitFor(() => expect(screen.getByText('Selfie taken')).toBeInTheDocument())
    expect(screen.queryByText(/No face detected/i)).not.toBeInTheDocument()
  })

  it('accepts selfie when FaceDetector is unavailable (graceful fallback)', async () => {
    // Simulate face-api/FaceDetector both unavailable: detectFaceInImage returns true
    mockDetectFace.mockResolvedValue(true)
    render(<Verify />, { wrapper })

    uploadToInput(getSelfieInput(), makeFile('selfie.jpg'))
    await waitFor(() => expect(screen.getByText('Selfie taken')).toBeInTheDocument())
  })

  it('shows checkUnavailable error and rejects selfie when detection throws', async () => {
    mockDetectFace.mockRejectedValue(new Error('face_check_unavailable'))
    render(<Verify />, { wrapper })

    uploadToInput(getSelfieInput(), makeFile('unknown.jpg'))

    await waitFor(() => {
      expect(screen.getByText(/Could not verify face/i)).toBeInTheDocument()
    })
    expect(screen.queryByText('Selfie taken')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Submit for review/i })).toBeDisabled()
  })
})

describe('Verify page — per-section upload errors', () => {
  async function fillAllSections() {
    uploadToInput(getIdInput(), makeFile('id.jpg'))

    uploadToInput(getSelfieInput(), makeFile('selfie.jpg'))
    await waitFor(() => expect(screen.getByText('Selfie taken')).toBeInTheDocument())

    uploadToInput(getLicenseInput(), makeFile('license.jpg'))
  }

  it('shows selfie upload error inside selfie section when selfie upload fails', async () => {
    render(<Verify />, { wrapper })
    await fillAllSections()

    // ID upload succeeds, selfie upload returns an error
    mockUpload
      .mockResolvedValueOnce({ error: null })                        // ID ok
      .mockResolvedValueOnce({ error: { message: 'Bucket not found' } }) // selfie fails

    await userEvent.setup().click(screen.getByRole('button', { name: /Submit for review/i }))

    await waitFor(() => {
      expect(screen.getByText('Bucket not found')).toBeInTheDocument()
    })
    // Submit stopped at selfie — insert was never called
    expect(mockInsert).not.toHaveBeenCalled()
    // License section is still visible (not replaced by an error)
    expect(screen.getByText('Certificate of Licensed Dealer')).toBeInTheDocument()
  })

  it('shows ID upload error inside ID section when ID upload fails', async () => {
    render(<Verify />, { wrapper })
    await fillAllSections()

    mockUpload.mockResolvedValueOnce({ error: { message: 'Storage error' } }) // ID fails

    await userEvent.setup().click(screen.getByRole('button', { name: /Submit for review/i }))

    await waitFor(() => {
      expect(screen.getByText('Storage error')).toBeInTheDocument()
    })
  })

  it('does NOT call supabase insert when upload fails', async () => {
    render(<Verify />, { wrapper })
    await fillAllSections()

    mockUpload.mockResolvedValueOnce({ error: { message: 'Bucket not found' } }) // ID fails

    await userEvent.setup().click(screen.getByRole('button', { name: /Submit for review/i }))

    await waitFor(() => expect(screen.getByText('Bucket not found')).toBeInTheDocument())
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
