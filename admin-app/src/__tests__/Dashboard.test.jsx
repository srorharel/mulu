import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// The mobile shell (drawer + top bar) is what we exercise here, so the seven
// tab pages are stubbed to keep the test about the chrome, not their loaders.
vi.mock('../pages/Jobs.jsx',         () => ({ default: () => <div>JobsStub</div> }))
vi.mock('../pages/Users.jsx',        () => ({ default: () => <div>UsersStub</div> }))
vi.mock('../pages/Content.jsx',      () => ({ default: () => <div>ContentStub</div> }))
vi.mock('../pages/Branding.jsx',     () => ({ default: () => <div>BrandingStub</div> }))
vi.mock('../pages/Broadcasts.jsx',   () => ({ default: () => <div>BroadcastsStub</div> }))
vi.mock('../pages/DesignEditor.jsx', () => ({ default: () => <div>DesignStub</div> }))
vi.mock('../pages/Config.jsx',       () => ({ default: () => <div>ConfigStub</div> }))

const changeLanguage = vi.fn()
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'en', changeLanguage } }),
}))

const signOut = vi.fn()
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ profile: { full_name: 'Admin Person' }, signOut }),
}))

import Dashboard from '../pages/Dashboard.jsx'

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/jobs']}>
      <Routes>
        <Route path="/:tab?" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { changeLanguage.mockClear(); signOut.mockClear() })

describe('Dashboard mobile shell', () => {
  it('renders the mobile menu toggle and the persistent rail', () => {
    renderDashboard()
    // Mobile hamburger toggle is in the DOM (visibility is CSS-only at lg:).
    expect(screen.getByLabelText('Open menu')).toBeInTheDocument()
    // The persistent desktop rail is always rendered (hidden via lg: CSS).
    // Its footer holds exactly one Export action while the drawer is closed.
    expect(screen.getByText('Export branding + config')).toBeInTheDocument()
    // Drawer is not mounted until opened.
    expect(screen.queryByLabelText('Close menu')).toBeNull()
  })

  it('opens the slide-in drawer when the hamburger is tapped', () => {
    renderDashboard()
    fireEvent.click(screen.getByLabelText('Open menu'))
    // Backdrop close-affordance appears…
    expect(screen.getByLabelText('Close menu')).toBeInTheDocument()
    // …and the rail body now exists twice (persistent rail + drawer).
    expect(screen.getAllByText('Export branding + config')).toHaveLength(2)
  })

  it('closes the drawer when the backdrop is tapped', () => {
    renderDashboard()
    fireEvent.click(screen.getByLabelText('Open menu'))
    fireEvent.click(screen.getByLabelText('Close menu'))
    expect(screen.queryByLabelText('Close menu')).toBeNull()
    expect(screen.getAllByText('Export branding + config')).toHaveLength(1)
  })

  it('closes the drawer on Escape', () => {
    renderDashboard()
    fireEvent.click(screen.getByLabelText('Open menu'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByLabelText('Close menu')).toBeNull()
  })

  it('closes the drawer after a tab is selected', () => {
    renderDashboard()
    fireEvent.click(screen.getByLabelText('Open menu'))
    // Two instances of each tab button exist (rail + drawer); the drawer's is last.
    const usersButtons = screen.getAllByRole('button', { name: 'dashboard.tabs.users' })
    fireEvent.click(usersButtons[usersButtons.length - 1])
    expect(screen.queryByLabelText('Close menu')).toBeNull()
  })
})
