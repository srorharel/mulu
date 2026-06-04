import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

let authValue = { user: null, loading: false }

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => authValue }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k, i18n: { language: 'he' } }) }))
// DeleteAccountModal is imported by the page; mock its module deps so importing
// the page has no side effects (it isn't rendered in the logged-out case).
vi.mock('../lib/supabase.js', () => ({ supabase: { functions: { invoke: () => Promise.resolve({ error: null }) } } }))
vi.mock('../lib/notifications.js', () => ({ unregisterToken: () => Promise.resolve() }))
vi.mock('../components/ui/Toast.jsx', () => ({ useToast: () => () => {} }))

import AccountDeletion from '../pages/AccountDeletion.jsx'

describe('AccountDeletion (public /account/delete)', () => {
  it('shows deletion instructions + support contact when logged out', () => {
    authValue = { user: null, loading: false }
    render(<AccountDeletion />)
    expect(screen.getByText('account.delete.webInstructions')).toBeInTheDocument()
    expect(screen.getByText('account.delete.webRetained')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', 'mailto:support@wash.co.il')
  })

  it('offers the deletion action (not instructions) when logged in', () => {
    authValue = { user: { id: 'u1' }, loading: false }
    render(<AccountDeletion />)
    expect(screen.getByRole('button', { name: 'account.delete.title' })).toBeInTheDocument()
    expect(screen.queryByText('account.delete.webInstructions')).not.toBeInTheDocument()
  })
})
