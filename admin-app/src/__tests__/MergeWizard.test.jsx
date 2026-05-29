import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const rpcCalls = []
const keepProfile = { id: 'k1', full_name: 'Keep User', role: 'consumer' }
const matchRow    = { id: 'm1', full_name: 'Merge User', role: 'consumer' }

vi.mock('../lib/supabase.js', () => {
  function chain() {
    let rows = []
    const obj = {
      _rows: [],
      select: () => obj,
      eq:     () => obj,
      or:     () => obj,
      order:  () => obj,
      limit:  () => obj,
      single: () => Promise.resolve({ data: keepProfile, error: null }),
      then(r) { return Promise.resolve({ data: rows, error: null }).then(r) },
      _setRows(r) { rows = r },
    }
    return obj
  }
  return {
    supabase: {
      from: () => chain(),
      rpc: (name, args) => {
        rpcCalls.push({ name, args })
        return Promise.resolve({ data: { keep: 'k1', merged: 'm1' }, error: null })
      },
    },
  }
})

// Stub searchUsers to return our row.
vi.mock('../lib/adminUsers.js', async (orig) => {
  const actual = await orig()
  return {
    ...actual,
    searchUsers: vi.fn(() => Promise.resolve([matchRow])),
    fetchUserDetail: vi.fn(() => Promise.resolve(keepProfile)),
    adminMergeUsers: vi.fn(({ keepUserId, mergeUserId, reason }) => {
      rpcCalls.push({ name: 'admin_merge_users', args: { p_keep_user_id: keepUserId, p_merge_user_id: mergeUserId, p_reason: reason } })
      return Promise.resolve({ keep: keepUserId, merged: mergeUserId })
    }),
  }
})

import MergeWizard from '../components/users/MergeWizard.jsx'

beforeEach(() => { rpcCalls.length = 0 })

describe('MergeWizard', () => {
  it('walks step 1 → 2 → 3 → Merge and calls adminMergeUsers', async () => {
    const onDone = vi.fn()
    render(<MergeWizard keepUserId="k1" onClose={() => {}} onDone={onDone} />)

    await waitFor(() => expect(screen.getByText('Keep User')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/Find user/), { target: { value: 'merge' } })
    await waitFor(() => expect(screen.getByText('Merge User')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Merge User'))
    fireEvent.click(screen.getByText('Next'))

    // Step 2 — enter reason
    fireEvent.change(screen.getByPlaceholderText(/Reason/), { target: { value: 'duplicate signup' } })
    fireEvent.click(screen.getByText('Next'))

    // Step 3 — confirm
    fireEvent.click(screen.getByText('Merge'))
    await waitFor(() => {
      expect(rpcCalls.find(c => c.name === 'admin_merge_users')).toBeTruthy()
      expect(onDone).toHaveBeenCalled()
    })
  })
})
