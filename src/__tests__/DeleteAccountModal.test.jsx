import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

let invokeResult = { data: { ok: true }, error: null }
const invokeSpy = vi.fn(() => Promise.resolve(invokeResult))
const signOutSpy = vi.fn(() => Promise.resolve())
const unregisterSpy = vi.fn(() => Promise.resolve())

vi.mock('../lib/supabase.js', () => ({ supabase: { functions: { invoke: (...a) => invokeSpy(...a) } } }))
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => ({ signOut: signOutSpy }) }))
vi.mock('../components/ui/Toast.jsx', () => ({ useToast: () => () => {} }))
vi.mock('../lib/notifications.js', () => ({ unregisterToken: () => unregisterSpy() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k, opts) => (k === 'account.delete.confirmWord' ? 'DELETE' : (opts?.word ? `${k}:${opts.word}` : k)),
    i18n: { language: 'en' },
  }),
}))

import DeleteAccountModal from '../components/account/DeleteAccountModal.jsx'

const BTN = 'account.delete.confirmButton'
const INPUT = 'account.delete.confirmInputLabel'

beforeEach(() => {
  invokeResult = { data: { ok: true }, error: null }
  invokeSpy.mockClear(); signOutSpy.mockClear(); unregisterSpy.mockClear()
})

describe('DeleteAccountModal', () => {
  it('requires the exact confirm word before enabling deletion', async () => {
    render(<DeleteAccountModal onClose={() => {}} />)
    const btn = screen.getByRole('button', { name: BTN })
    expect(btn).toBeDisabled()

    const input = screen.getByLabelText(INPUT)
    await userEvent.type(input, 'nope')
    expect(btn).toBeDisabled()

    await userEvent.clear(input)
    await userEvent.type(input, 'DELETE')
    expect(btn).toBeEnabled()
    expect(invokeSpy).not.toHaveBeenCalled() // gesture alone must not fire the call
  })

  it('on success invokes delete-account, unregisters the token, and signs out', async () => {
    render(<DeleteAccountModal onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText(INPUT), 'DELETE')
    await userEvent.click(screen.getByRole('button', { name: BTN }))

    await waitFor(() => expect(invokeSpy).toHaveBeenCalledWith('delete-account', { body: {} }))
    await waitFor(() => expect(unregisterSpy).toHaveBeenCalled())
    await waitFor(() => expect(signOutSpy).toHaveBeenCalled())
  })

  it('does not sign out if the function errors', async () => {
    invokeResult = { data: null, error: { message: 'boom' } }
    render(<DeleteAccountModal onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText(INPUT), 'DELETE')
    await userEvent.click(screen.getByRole('button', { name: BTN }))
    await waitFor(() => expect(invokeSpy).toHaveBeenCalled())
    expect(signOutSpy).not.toHaveBeenCalled()
  })
})
