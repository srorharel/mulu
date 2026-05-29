import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Keep the real display helpers; stub only the network functions.
vi.mock('../lib/adminHistory.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchActivityFeed: vi.fn(),
    undoChange: vi.fn(),
    fetchDeletionSnapshot: vi.fn(),
    restoreUser: vi.fn(),
  }
})

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'en' } }),
}))

import History from '../pages/History.jsx'
import { fetchActivityFeed } from '../lib/adminHistory.js'

const FIXTURE = [
  {
    source_table: 'admin_change_history', ref_id: 'h1', entity_type: 'content_override',
    category: 'content', entity_label: 'main/en/consumer.home.bookCta', action: 'update',
    actor_name: 'Harel', reason: null, undoable: true,
    before_value: { value: 'Book now' }, after_value: { value: 'Order wash' },
    occurred_at: '2026-05-29T10:00:00Z',
  },
  {
    source_table: 'admin_user_audit', ref_id: 'u1', entity_type: 'user',
    category: 'users', entity_label: 'User Yossi Levi', action: 'delete_user',
    actor_name: 'Harel', reason: 'spam', undoable: false,
    before_value: { full_name: 'Yossi Levi' }, after_value: null,
    occurred_at: '2026-05-29T09:00:00Z',
  },
  {
    source_table: 'broadcast_notifications', ref_id: 'b1', entity_type: 'broadcast',
    category: 'broadcasts', entity_label: 'Spring promo', action: 'sent',
    actor_name: 'Harel', reason: 'Sent to 38 recipients', undoable: false,
    before_value: null, after_value: { title_en: 'Spring promo' },
    occurred_at: '2026-05-29T08:00:00Z',
  },
]

beforeEach(() => {
  fetchActivityFeed.mockReset()
  fetchActivityFeed.mockResolvedValue(FIXTURE)
})

describe('History tab', () => {
  it('renders the feed entries', async () => {
    render(<History />)
    await waitFor(() => expect(screen.getByText('main/en/consumer.home.bookCta')).toBeTruthy())
    expect(screen.getByText('User Yossi Levi')).toBeTruthy()
    expect(screen.getByText('Spring promo')).toBeTruthy()
  })

  it('shows Undo only on undoable rows, Restore on deletions, and Not reversible otherwise', async () => {
    render(<History />)
    await waitFor(() => expect(screen.getByText('main/en/consumer.home.bookCta')).toBeTruthy())

    // exactly one undoable row → one Undo button
    expect(screen.getAllByText('Undo')).toHaveLength(1)
    // exactly one user-deletion → one Restore button
    expect(screen.getAllByText(/Restore \(best-effort\)/)).toHaveLength(1)
    // broadcast row → Not reversible (the deletion row is restorable, not "not reversible")
    expect(screen.getAllByText('Not reversible')).toHaveLength(1)
  })

  it('renders the filter pills', async () => {
    render(<History />)
    await waitFor(() => expect(screen.getByText('All')).toBeTruthy())
    expect(screen.getByText('Content')).toBeTruthy()
    expect(screen.getByText('Config')).toBeTruthy()
    expect(screen.getByText('Broadcasts')).toBeTruthy()
  })
})
