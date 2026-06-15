import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import i18next from 'i18next'
import { MemoryRouter } from 'react-router-dom'

// Single mutable auth holder so each test can supply exactly the slice of the
// auth context the page under test needs (signIn / signUp / resetPassword / …).
const auth = vi.hoisted(() => ({ current: {} }))
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth.current }))

import Login from '../pages/Login.jsx'
import SignUp from '../pages/SignUp.jsx'
import ForgotPassword from '../pages/ForgotPassword.jsx'
import ResetPassword from '../pages/ResetPassword.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        'auth.email': 'Email',
        'auth.emailPlaceholder': 'you@example.com',
        'auth.password': 'Password',
        'auth.passwordPlaceholder': 'Your password',
        'auth.signIn': 'Sign in',
        'auth.signingIn': 'Signing in…',
        'auth.forgotPassword': 'Forgot password?',
        'auth.resetPasswordCta': 'Reset your password',
        'auth.alreadyHaveAccount': 'Already have an account?',
        'auth.errors.invalidCredentials': 'Invalid email or password',
        'signup.title': 'Create account',
        'signup.fullName': 'Full name',
        'signup.fullNamePlaceholder': 'Avi Cohen',
        'signup.confirmPassword': 'Confirm password',
        'signup.confirmPasswordPlaceholder': 'Repeat your password',
        'signup.passwordPlaceholder': '8+ characters',
        'signup.creatingAccount': 'Creating account…',
        'signup.errors.phoneInUse': 'That phone number is already linked to an account.',
        'signup.errors.emailInUse': 'That email is already registered.',
        'profile.phone': 'Phone',
        'profile.phonePlaceholder': '050-0000000',
        'validation.invalidPhone': 'Enter a valid phone number',
        'validation.passwordsDoNotMatch': "Passwords don't match",
        'forgot.title': 'Reset your password',
        'forgot.submit': 'Send reset link',
        'forgot.sentTitle': 'Check your email',
        'forgot.sentBody': "If an account exists for {{email}}, we've sent a link.",
        'reset.title': 'Set a new password',
        'reset.newPassword': 'New password',
        'reset.submit': 'Update password',
        'reset.doneTitle': 'Password updated',
        'reset.invalidTitle': 'Link expired',
        'reset.tooShort': 'Use at least 8 characters',
        'signup.backToSignIn': 'Back to sign in',
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

beforeEach(() => { auth.current = {} })

describe('Login — wrong password', () => {
  it('shows a generic credentials error and offers a reset link', async () => {
    const signIn = vi.fn(() => Promise.resolve({ data: null, error: { message: 'Invalid login credentials' } }))
    auth.current = { signIn }
    const user = userEvent.setup()
    render(<Login />, { wrapper })

    await user.type(screen.getByPlaceholderText('you@example.com'), 'real@user.com')
    await user.type(screen.getByPlaceholderText('Your password'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /Sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument()
    })
    // The reset CTA appears only on a credentials error — routes to /forgot-password.
    const reset = screen.getByRole('link', { name: 'Reset your password' })
    expect(reset).toHaveAttribute('href', '/forgot-password')
  })

  it('always shows a working "Forgot password?" link (no longer "coming soon")', () => {
    auth.current = { signIn: vi.fn() }
    render(<Login />, { wrapper })
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
  })
})

describe('SignUp — duplicate phone', () => {
  it('blocks signup and shows "phone in use" without creating an account', async () => {
    const signUp = vi.fn(() => Promise.resolve({ data: { session: null }, error: null }))
    const checkPhoneAvailable = vi.fn(() => Promise.resolve(false))  // taken
    auth.current = { signUp, checkPhoneAvailable }
    const user = userEvent.setup()
    render(<SignUp role="consumer" />, { wrapper })

    await user.type(screen.getByPlaceholderText('Avi Cohen'), 'Test User')
    await user.type(screen.getByPlaceholderText('050-0000000'), '0501234567')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'new@user.com')
    await user.type(screen.getByPlaceholderText('8+ characters'), 'password123')
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'password123')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /Create account/i }))

    await waitFor(() => {
      expect(screen.getByText('That phone number is already linked to an account.')).toBeInTheDocument()
    })
    expect(checkPhoneAvailable).toHaveBeenCalledWith('0501234567')
    expect(signUp).not.toHaveBeenCalled()
  })

  it('blocks signup and shows "email in use" without calling signUp (enumeration-safe pre-check)', async () => {
    // Supabase's enumeration protection means a duplicate email does NOT error on
    // signUp (it resolves with user:null, same as a fresh "check your email"
    // signup), so the duplicate must be caught BEFORE signUp via checkEmailAvailable
    // (RPC email_available, migration 0125) — mirroring the phone pre-check.
    const signUp = vi.fn()
    const checkPhoneAvailable = vi.fn(() => Promise.resolve(true))  // phone is free
    const checkEmailAvailable = vi.fn(() => Promise.resolve(false)) // email is taken
    auth.current = { signUp, checkPhoneAvailable, checkEmailAvailable }
    const user = userEvent.setup()
    render(<SignUp role="consumer" />, { wrapper })

    await user.type(screen.getByPlaceholderText('Avi Cohen'), 'Test User')
    await user.type(screen.getByPlaceholderText('050-0000000'), '0501234567')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'taken@user.com')
    await user.type(screen.getByPlaceholderText('8+ characters'), 'password123')
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'password123')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /Create account/i }))

    await waitFor(() => {
      expect(screen.getByText('That email is already registered.')).toBeInTheDocument()
    })
    expect(checkEmailAvailable).toHaveBeenCalledWith('taken@user.com')
    expect(signUp).not.toHaveBeenCalled()
    // It must NOT fall through to the neutral "check your email" screen.
    expect(screen.queryByText(/Back to sign in/i)).not.toBeInTheDocument()
  })

  it('rejects a phone number shorter than 9 digits before any probe', async () => {
    const signUp = vi.fn()
    const checkPhoneAvailable = vi.fn(() => Promise.resolve(true))
    auth.current = { signUp, checkPhoneAvailable }
    const user = userEvent.setup()
    render(<SignUp role="consumer" />, { wrapper })

    await user.type(screen.getByPlaceholderText('Avi Cohen'), 'Test User')
    await user.type(screen.getByPlaceholderText('050-0000000'), '12345')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'new@user.com')
    await user.type(screen.getByPlaceholderText('8+ characters'), 'password123')
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'password123')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /Create account/i }))

    await waitFor(() => {
      expect(screen.getByText('Enter a valid phone number')).toBeInTheDocument()
    })
    expect(checkPhoneAvailable).not.toHaveBeenCalled()
    expect(signUp).not.toHaveBeenCalled()
  })
})

describe('ForgotPassword', () => {
  it('sends a reset email and shows a neutral confirmation', async () => {
    const resetPassword = vi.fn(() => Promise.resolve({ data: {}, error: null }))
    auth.current = { resetPassword }
    const user = userEvent.setup()
    render(<ForgotPassword />, { wrapper })

    await user.type(screen.getByPlaceholderText('you@example.com'), 'someone@user.com')
    await user.click(screen.getByRole('button', { name: /Send reset link/i }))

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument()
    })
    expect(resetPassword).toHaveBeenCalledWith('someone@user.com')
  })
})

describe('ResetPassword', () => {
  it('shows the form for a valid recovery session and updates the password', async () => {
    const updatePassword = vi.fn(() => Promise.resolve({ error: null }))
    auth.current = { user: { id: 'u1' }, loading: false, updatePassword }
    const user = userEvent.setup()
    render(<ResetPassword />, { wrapper })

    await user.type(screen.getByPlaceholderText('8+ characters'), 'newpass123')
    await user.type(screen.getByPlaceholderText('Repeat your password'), 'newpass123')
    await user.click(screen.getByRole('button', { name: /Update password/i }))

    await waitFor(() => {
      expect(screen.getByText('Password updated')).toBeInTheDocument()
    })
    expect(updatePassword).toHaveBeenCalledWith('newpass123')
  })

  it('shows an expired-link message when there is no recovery session', () => {
    auth.current = { user: null, loading: false, updatePassword: vi.fn() }
    render(<ResetPassword />, { wrapper })
    expect(screen.getByText('Link expired')).toBeInTheDocument()
  })
})
