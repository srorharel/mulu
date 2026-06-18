import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'

// Two washers, one pending order. The server serializes accepts (the order row is
// locked + status-checked in transition_order_status), so the SECOND washer's
// accept RPC is rejected. This pins the CLIENT side of that contract: the loser
// must NOT be left on a tappable "pending" screen — they get a clear "already
// taken" message and the Accept button is gone.

const rpcMock   = vi.fn()
const toastMock = vi.fn()
const navMock   = vi.fn()
let mockOrder

vi.mock('../../../lib/supabase.js', () => ({
  supabase: { rpc: (...a) => rpcMock(...a) },
  isSupabaseConfigured: true,
}))
// Control the order directly; realtime/refetch are exercised by useRealtimeOrder's
// own tests. Here we only care about JobDetail's accept-failure handling.
vi.mock('../../../hooks/useRealtimeOrder.js', () => ({
  useRealtimeOrder: () => ({ order: mockOrder, loading: false, error: null }),
}))
vi.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ profile: { current_tier: 1 } }),
}))
vi.mock('../../../components/ui/Toast.jsx', () => ({ useToast: () => toastMock }))
vi.mock('../../../components/ui/PageShell.jsx', () => ({ default: ({ children }) => children }))
vi.mock('../../../components/editable/Editable.jsx', () => ({ default: ({ children }) => children }))
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => navMock,
}))

import JobDetail from '../JobDetail.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
})

function renderJobDetail() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/washer/job/j1']}>
        <Routes>
          <Route path="/washer/job/:id" element={<JobDetail />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>
  )
}

describe('JobDetail — losing the accept race', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    toastMock.mockReset()
    navMock.mockReset()
    mockOrder = {
      id: 'j1', status: 'pending', car_type: 'sedan', service_type: 'wash',
      address_label: 'Tel Aviv', created_at: new Date().toISOString(), lat: 32.05, lng: 34.8,
    }
  })

  it('shows the Accept button while the job is pending', () => {
    renderJobDetail()
    expect(screen.getByText(en.washer.jobDetail.acceptJob)).toBeTruthy()
    expect(screen.queryByText(en.washer.jobDetail.unavailable)).toBeNull()
  })

  it('flips to unavailable with an "already taken" toast when accept is rejected', async () => {
    // Server rejects: another washer already accepted → status moved off pending.
    rpcMock.mockResolvedValue({ error: { message: 'Invalid transition: accepted → accepted for role washer' } })
    renderJobDetail()

    fireEvent.click(screen.getByText(en.washer.jobDetail.acceptJob))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(en.washer.jobDetail.alreadyTaken, 'error')
    })
    // Button gone, unavailable notice shown, no navigation to the active dashboard.
    expect(screen.queryByText(en.washer.jobDetail.acceptJob)).toBeNull()
    expect(screen.getByText(en.washer.jobDetail.unavailable)).toBeTruthy()
    expect(navMock).not.toHaveBeenCalled()
  })

  it('keeps the washer on-page (no "taken" flip) when the failure is their own active job', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'Cannot accept: you have an active or pending-approval job' } })
    renderJobDetail()

    fireEvent.click(screen.getByText(en.washer.jobDetail.acceptJob))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith('Cannot accept: you have an active or pending-approval job', 'error')
    })
    // This error is about the washer, not the order — the Accept button stays.
    expect(screen.getByText(en.washer.jobDetail.acceptJob)).toBeTruthy()
    expect(screen.queryByText(en.washer.jobDetail.unavailable)).toBeNull()
  })

  it('accepts cleanly and navigates to the dashboard when the RPC succeeds', async () => {
    rpcMock.mockResolvedValue({ error: null })
    renderJobDetail()

    fireEvent.click(screen.getByText(en.washer.jobDetail.acceptJob))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(en.washer.jobDetail.accepted, 'success')
    })
    expect(navMock).toHaveBeenCalledWith('/washer', expect.objectContaining({
      state: expect.objectContaining({ acceptedJob: expect.objectContaining({ id: 'j1' }) }),
    }))
  })
})
