import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'

// Mock Auth context
const mockSignUp = vi.fn()
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ signUp: mockSignUp }),
}))

// Mock react-router navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import SignUp from '../pages/SignUp.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        'signup.title': 'Create account',
        'signup.subtitle': 'Join the MULU network',
        'signup.iAmA': 'I am a…',
        'signup.customer': "I'm a customer",
        'signup.washer': "I'm a washer",
        'signup.fullName': 'Full name',
        'signup.fullNamePlaceholder': 'Avi Cohen',
        'signup.confirmPassword': 'Confirm password',
        'signup.confirmPasswordPlaceholder': 'Repeat your password',
        'signup.passwordPlaceholder': '8+ characters',
        'signup.creatingAccount': 'Creating account…',
        'signup.checkEmail': 'Check your email',
        'signup.confirmationSent': 'We sent a confirmation link to {{email}}.',
        'signup.backToSignIn': 'Back to sign in',
        'auth.email': 'Email',
        'auth.emailPlaceholder': 'you@example.com',
        'auth.password': 'Password',
        'auth.alreadyHaveAccount': 'Already have an account?',
        'auth.signIn': 'Sign in',
        'washerSignup.serviceAreas.label': 'Area of activity',
        'washerSignup.serviceAreas.placeholder': 'Select cities…',
        'washerSignup.serviceAreas.required': 'Select at least one area',
        'washerSignup.serviceAreas.cities.holon': 'Holon',
        'washerSignup.serviceAreas.cities.rishon_lezion': 'Rishon LeZion',
        'washerSignup.serviceAreas.cities.bat_yam': 'Bat Yam',
        'washerSignup.dealerNumber.label': 'Licensed dealer / company number',
        'washerSignup.dealerNumber.placeholder': 'Enter 7–9 digit number',
        'washerSignup.dealerNumber.error': 'Must be 7–9 digits',
        'validation.passwordsDoNotMatch': "Passwords don't match",
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

function fillBaseFields(user) {
  return async () => {
    await user.type(screen.getByPlaceholderText('Avi Cohen'), 'Test User')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('8+ characters'), 'password123')
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'password123')
  }
}

describe('SignUp — role selection', () => {
  it('does NOT show washer fields when consumer role is selected', () => {
    render(<SignUp />, { wrapper })
    expect(screen.queryByText('Area of activity')).not.toBeInTheDocument()
    expect(screen.queryByText('Licensed dealer / company number')).not.toBeInTheDocument()
  })

  it('reveals service areas and dealer number when washer role is selected', async () => {
    const user = userEvent.setup()
    render(<SignUp />, { wrapper })

    await user.click(screen.getByText("I'm a washer"))

    await waitFor(() => {
      expect(screen.getByText('Area of activity')).toBeInTheDocument()
      expect(screen.getByText('Licensed dealer / company number')).toBeInTheDocument()
    })
  })

  it('hides washer fields again when consumer role is re-selected', async () => {
    const user = userEvent.setup()
    render(<SignUp />, { wrapper })

    await user.click(screen.getByText("I'm a washer"))
    await waitFor(() => expect(screen.getByText('Area of activity')).toBeInTheDocument())

    await user.click(screen.getByText("I'm a customer"))
    await waitFor(() => expect(screen.queryByText('Area of activity')).not.toBeInTheDocument())
  })
})

describe('SignUp — service area picker', () => {
  it('shows exactly 3 city options when area picker is opened', async () => {
    const user = userEvent.setup()
    render(<SignUp />, { wrapper })
    await user.click(screen.getByText("I'm a washer"))
    await waitFor(() => expect(screen.getByText('Select cities…')).toBeInTheDocument())

    await user.click(screen.getByText('Select cities…'))

    await waitFor(() => {
      expect(screen.getByText('Holon')).toBeInTheDocument()
      expect(screen.getByText('Rishon LeZion')).toBeInTheDocument()
      expect(screen.getByText('Bat Yam')).toBeInTheDocument()
    })
    const cityButtons = screen.getAllByRole('button', { name: /Holon|Rishon LeZion|Bat Yam/i })
    expect(cityButtons).toHaveLength(3)
  })

  it('adds selected city as a chip', async () => {
    const user = userEvent.setup()
    render(<SignUp />, { wrapper })
    await user.click(screen.getByText("I'm a washer"))
    await waitFor(() => expect(screen.getByText('Select cities…')).toBeInTheDocument())
    await user.click(screen.getByText('Select cities…'))
    await user.click(screen.getByText('Holon'))

    await waitFor(() => {
      const chips = screen.getAllByText('Holon')
      expect(chips.length).toBeGreaterThanOrEqual(1)
    })
  })
})

async function selectArea(user, cityName) {
  await user.click(screen.getByText('Select cities…'))
  await waitFor(() => expect(screen.getByText(cityName)).toBeInTheDocument())
  await user.click(screen.getByText(cityName))
}

describe('SignUp — dealer number validation', () => {
  it('rejects non-digit input', async () => {
    const user = userEvent.setup()
    render(<SignUp />, { wrapper })
    await user.click(screen.getByText("I'm a washer"))
    await waitFor(() => expect(screen.getByPlaceholderText('Enter 7–9 digit number')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Enter 7–9 digit number'), 'abc')

    await user.type(screen.getByPlaceholderText('Avi Cohen'), 'Test User')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('8+ characters'), 'password123')
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'password123')
    await selectArea(user, 'Holon')

    await user.click(screen.getByRole('button', { name: /Create account/i }))

    await waitFor(() => {
      expect(screen.getByText('Must be 7–9 digits')).toBeInTheDocument()
    })
  })

  it('rejects dealer number shorter than 7 digits', async () => {
    const user = userEvent.setup()
    render(<SignUp />, { wrapper })
    await user.click(screen.getByText("I'm a washer"))
    await waitFor(() => expect(screen.getByPlaceholderText('Enter 7–9 digit number')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Enter 7–9 digit number'), '12345')

    await user.type(screen.getByPlaceholderText('Avi Cohen'), 'Test User')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('8+ characters'), 'password123')
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'password123')
    await selectArea(user, 'Holon')

    await user.click(screen.getByRole('button', { name: /Create account/i }))

    await waitFor(() => {
      expect(screen.getByText('Must be 7–9 digits')).toBeInTheDocument()
    })
  })

  it('rejects dealer number longer than 9 digits', async () => {
    const user = userEvent.setup()
    render(<SignUp />, { wrapper })
    await user.click(screen.getByText("I'm a washer"))
    await waitFor(() => expect(screen.getByPlaceholderText('Enter 7–9 digit number')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Enter 7–9 digit number'), '1234567890')

    await user.type(screen.getByPlaceholderText('Avi Cohen'), 'Test User')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('8+ characters'), 'password123')
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'password123')
    await selectArea(user, 'Holon')

    await user.click(screen.getByRole('button', { name: /Create account/i }))

    await waitFor(() => {
      expect(screen.getByText('Must be 7–9 digits')).toBeInTheDocument()
    })
  })
})

describe('SignUp — washer submit flow', () => {
  beforeEach(() => {
    mockSignUp.mockReset()
    mockNavigate.mockReset()
  })

  it('navigates to /signup/washer/verify on successful washer signup with session', async () => {
    mockSignUp.mockResolvedValue({
      data: { session: { user: { id: 'uid-1' } } },
      error: null,
    })

    const user = userEvent.setup()
    render(<SignUp />, { wrapper })
    await user.click(screen.getByText("I'm a washer"))
    await waitFor(() => expect(screen.getByPlaceholderText('Enter 7–9 digit number')).toBeInTheDocument())

    // Open area picker and select Holon
    await selectArea(user, 'Holon')

    await user.type(screen.getByPlaceholderText('Enter 7–9 digit number'), '1234567')
    await user.type(screen.getByPlaceholderText('Avi Cohen'), 'Test Washer')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'washer@test.com')
    await user.type(screen.getByPlaceholderText('8+ characters'), 'password123')
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'password123')

    await user.click(screen.getByRole('button', { name: /Create account/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/signup/washer/verify',
        expect.objectContaining({ state: expect.objectContaining({ serviceAreas: ['holon'], dealerNumber: '1234567' }) })
      )
    })
  })

  it('requires at least one service area for washer role', async () => {
    const user = userEvent.setup()
    render(<SignUp />, { wrapper })
    await user.click(screen.getByText("I'm a washer"))
    await waitFor(() => expect(screen.getByPlaceholderText('Enter 7–9 digit number')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Enter 7–9 digit number'), '1234567')
    await user.type(screen.getByPlaceholderText('Avi Cohen'), 'Test Washer')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'washer@test.com')
    await user.type(screen.getByPlaceholderText('8+ characters'), 'password123')
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'password123')

    await user.click(screen.getByRole('button', { name: /Create account/i }))

    await waitFor(() => {
      expect(screen.getByText('Select at least one area')).toBeInTheDocument()
    })
    expect(mockSignUp).not.toHaveBeenCalled()
  })
})
