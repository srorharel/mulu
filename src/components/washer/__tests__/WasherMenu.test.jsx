import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'

// ── Hoisted mock state ──────────────────────────────────────────────────────
// useSupportUnread's return value is varied per test via this hoisted holder
// (a plain module-level `let` would hit the TDZ when the mock factory runs).
const unread = vi.hoisted(() => ({ count: 0 }))
const mockSignOut = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockNavigate = vi.hoisted(() => vi.fn())

// ── Module mocks ────────────────────────────────────────────────────────────
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: () => ({
    profile: { full_name: 'Dana Washer', email: 'dana@example.com' },
    signOut: mockSignOut,
  }),
}))

vi.mock('../../../hooks/useSupportUnread.js', () => ({
  useSupportUnread: () => unread.count,
}))

// Collapse the real browser-history dance to a direct onClose() call so the
// controlled `open` prop flips synchronously in the harness below — that flip is
// what triggers WasherMenu's deferred navigate() effect.
vi.mock('../../../hooks/useHistoryDismissible.js', () => ({
  useHistoryDismissible: (_open, onClose) => ({ dismiss: () => onClose() }),
}))

// Editable wraps a single child for the design editor; render the child straight
// through so the test doesn't need the DesignOverrides provider.
vi.mock('../../editable/Editable.jsx', () => ({
  default: ({ children }) => children,
}))

import WasherMenu from '../WasherMenu.jsx'

// ── i18n ────────────────────────────────────────────────────────────────────
const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        washer: {
          menu: {
            profile: 'Profile',
            earnings: 'Earnings',
            shop: 'Shop',
            support: 'Support',
            settings: 'Settings',
            signOut: 'Sign out',
            navigationMenu: 'Navigation menu',
          },
          toggle: { online: 'Online', offline: 'Offline' },
        },
      },
    },
  },
})

// ── Harness ─────────────────────────────────────────────────────────────────
// Owns `open` state so that dismiss() → onClose() actually closes the menu,
// which is the condition WasherMenu waits on before navigating.
function Harness({ online = true }) {
  const [open, setOpen] = useState(true)
  return <WasherMenu open={open} onClose={() => setOpen(false)} online={online} />
}

function renderMenu(props = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <Harness {...props} />
      </MemoryRouter>
    </I18nextProvider>
  )
}

const NAV_ROUTES = [
  ['Profile', '/profile'],
  ['Earnings', '/washer/earnings'],
  ['Shop', '/washer/shop'],
  ['Support', '/support'],
  ['Settings', '/washer/settings'],
]

beforeEach(() => {
  vi.clearAllMocks()
  unread.count = 0
})

// ── Tests ───────────────────────────────────────────────────────────────────
describe('WasherMenu — structure', () => {
  it('renders all five nav items and Sign out', () => {
    renderMenu()
    for (const [label] of NAV_ROUTES) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('renders the washer display name and an Online indicator', () => {
    renderMenu({ online: true })
    expect(screen.getByText('Dana Washer')).toBeInTheDocument()
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('shows the Offline indicator when not online', () => {
    renderMenu({ online: false })
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.queryByText('Online')).not.toBeInTheDocument()
  })
})

describe('WasherMenu — support unread badge', () => {
  it('renders the unread dot when unread count > 0', () => {
    unread.count = 3
    renderMenu()
    expect(screen.getByTestId('support-unread-dot')).toBeInTheDocument()
  })

  it('does not render the unread dot when unread count is 0', () => {
    unread.count = 0
    renderMenu()
    expect(screen.queryByTestId('support-unread-dot')).not.toBeInTheDocument()
  })
})

describe('WasherMenu — actions', () => {
  it('invokes the sign-out handler exactly once on click', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it.each(NAV_ROUTES)('navigates to %s route (%s) on click', async (label, route) => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(route))
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })
})

describe('WasherMenu — RTL hygiene', () => {
  it('emits no physical left/right margin or padding utilities', () => {
    unread.count = 2 // exercise the badge branch too
    const { container } = renderMenu()
    expect(container.innerHTML).not.toMatch(/\b(ml-|mr-|pl-|pr-|left-|right-)/)
  })
})
