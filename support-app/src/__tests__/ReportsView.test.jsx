import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import i18next from 'i18next'
import { resources } from '../i18n/resources.js'

let reports = []
const setStatusSpy = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('../lib/moderation.js', () => ({
  fetchReports: () => Promise.resolve({ data: reports }),
  setReportStatus: (...a) => setStatusSpy(...a),
}))
vi.mock('../lib/supabase.js', () => ({
  supabase: { channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }), removeChannel: () => {} },
}))

import ReportsView from '../components/ReportsView.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({ resources, lng: 'en', fallbackLng: 'en' })
const wrapper = ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>

beforeEach(() => { reports = []; setStatusSpy.mockClear() })

describe('ReportsView', () => {
  it('shows the empty state when there are no reports', async () => {
    render(<ReportsView />, { wrapper })
    await waitFor(() => expect(screen.getByText('No reports.')).toBeInTheDocument())
  })

  it('lists reports and lets an agent mark one actioned', async () => {
    reports = [{
      id: 'r1', reporter_id: 'a', reported_user_id: 'b', context: 'order_chat',
      reason: 'spam', status: 'open', created_at: '2026-01-01T00:00:00Z',
    }]
    render(<ReportsView />, { wrapper })
    await waitFor(() => expect(screen.getByText('spam')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Mark actioned' }))
    await waitFor(() => expect(setStatusSpy).toHaveBeenCalledWith('r1', 'actioned'))
  })
})
