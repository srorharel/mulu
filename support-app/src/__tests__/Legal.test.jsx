import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import i18next from 'i18next'
import { resources } from '../i18n/resources.js'

// Legal editor (Phase 4): publish flow calls publish_legal_document with the
// correct args; non-agents see the agents-only guard and never reach the editor.

let historyRows = []
let rpcCalls = []
let authProfile = null

vi.mock('../lib/supabase.js', () => {
  const q = {
    eq: () => q,
    order: () => Promise.resolve({ data: historyRows, error: null }),
  }
  return {
    supabase: {
      from: () => ({ select: () => q }),
      rpc: (fn, args) => { rpcCalls.push({ fn, args }); return Promise.resolve({ data: [{ version: 2 }], error: null }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
    },
  }
})

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => ({ profile: authProfile, signOut: () => {} }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../components/LeftRail.jsx', () => ({ default: () => null }))
vi.mock('../components/MobileTabBar.jsx', () => ({ default: () => null }))

import Legal from '../pages/Legal.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({ resources, lng: 'en', fallbackLng: 'en' })
const wrapper = ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>

beforeEach(() => {
  historyRows = []
  rpcCalls = []
  authProfile = { id: 'agent1', role: 'agent', agent_display_name: 'Agent' }
})

describe('Legal editor', () => {
  it('publishes with the correct RPC args after confirmation', async () => {
    historyRows = [{
      id: '1', version: 1, title: 'Terms', content: '## Heading\n\nbody text',
      is_current: true, effective_date: null, published_at: '2026-01-01T00:00:00Z',
    }]
    render(<Legal />, { wrapper })

    // Editor prefills from the current version.
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Terms'))

    await userEvent.click(screen.getByRole('button', { name: 'Publish new version' }))
    // Confirm dialog → confirm.
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }))

    await waitFor(() => expect(rpcCalls.some(c => c.fn === 'publish_legal_document')).toBe(true))
    const call = rpcCalls.find(c => c.fn === 'publish_legal_document')
    expect(call.args).toEqual({
      p_doc_type: 'consumer_terms',
      p_locale: 'he',
      p_title: 'Terms',
      p_content: '## Heading\n\nbody text',
      p_effective_date: null,
    })
  })

  it('blocks non-agents and never calls publish', async () => {
    authProfile = { id: 'c1', role: 'consumer' }
    render(<Legal />, { wrapper })
    expect(screen.getByText('This page is for support agents only.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publish new version' })).not.toBeInTheDocument()
    expect(rpcCalls.some(c => c.fn === 'publish_legal_document')).toBe(false)
  })
})
