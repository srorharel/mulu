import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Integration test of LegalUpdateModal + useLegalAcknowledgment with the supabase
// client, auth, and toast mocked. Verifies: shows when pending, hides after
// acknowledge, never shows for agents (no pending RPC), and queues 2 docs.

let pendingRows = []
let authValue = null
let rpcCalls = []

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    rpc: (fn) => {
      rpcCalls.push(fn)
      if (fn === 'pending_legal_acknowledgments') return Promise.resolve({ data: pendingRows.slice(), error: null })
      return Promise.resolve({ data: null, error: null })
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  },
}))

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => authValue }))
vi.mock('../components/ui/Toast.jsx', () => ({ useToast: () => () => {} }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k, opts) => (opts && opts.count != null ? `${k}:${opts.count}` : k),
    i18n: { language: 'he' },
  }),
}))

import LegalUpdateModal from '../components/legal/LegalUpdateModal.jsx'

const doc = (doc_type, title) => ({
  doc_type, version: 1, locale: 'he', title,
  content: `## ${title}\n\nגוף המסמך.`, effective_date: null,
})

beforeEach(() => {
  pendingRows = []
  rpcCalls = []
  authValue = { user: { id: 'u1' }, profile: { role: 'consumer', locale: 'he' } }
})

describe('LegalUpdateModal', () => {
  it('shows a modal when the user has a pending document', async () => {
    pendingRows = [doc('consumer_terms', 'תנאי שימוש')]
    render(<LegalUpdateModal />)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'תנאי שימוש')
  })

  it('hides after the user acknowledges', async () => {
    pendingRows = [doc('consumer_terms', 'תנאי שימוש')]
    render(<LegalUpdateModal />)
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(rpcCalls).toContain('acknowledge_legal_document')
  })

  it('never shows for agents and never queries pending', async () => {
    authValue = { user: { id: 'a1' }, profile: { role: 'agent', locale: 'he' } }
    pendingRows = [doc('consumer_terms', 'x')] // would be pending, but agents are not eligible
    render(<LegalUpdateModal />)
    await new Promise(r => setTimeout(r, 20))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rpcCalls).not.toContain('pending_legal_acknowledgments')
  })

  it('queues multiple pending documents one at a time', async () => {
    pendingRows = [doc('consumer_terms', 'תנאי שימוש'), doc('privacy_policy', 'מדיניות פרטיות')]
    render(<LegalUpdateModal />)
    const first = await screen.findByRole('dialog')
    expect(first).toHaveAttribute('aria-label', 'תנאי שימוש')

    await userEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'מדיניות פרטיות'))

    await userEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
