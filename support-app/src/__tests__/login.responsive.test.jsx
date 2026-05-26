import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from '../pages/Login.jsx'

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ signIn: vi.fn(), agentBlocked: false }),
}))

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  )
}

describe('Login responsive layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a login form with email and password inputs', () => {
    renderLogin()
    expect(screen.getByPlaceholderText('agent@wash.co.il')).toBeTruthy()
  })

  it('desktop hero has text-5xl class and text-balance', () => {
    renderLogin()
    const hero = document.querySelector('h1')
    expect(hero).toBeTruthy()
    expect(hero.className).toMatch(/text-5xl/)
    expect(hero.style.textWrap).toBe('balance')
  })

  it('desktop hero is inside a hidden md:flex container', () => {
    renderLogin()
    const desktopPane = document.querySelector('.hidden.md\\:flex')
    expect(desktopPane).toBeTruthy()
    expect(desktopPane.querySelector('h1')).toBeTruthy()
  })

  it('login inputs have h-12 class for touch-friendly height', () => {
    renderLogin()
    const emailInput = screen.getByPlaceholderText('agent@wash.co.il')
    expect(emailInput.className).toMatch(/h-12/)
  })

  it('submit button has h-12 class', () => {
    renderLogin()
    const button = document.querySelector('button[type="submit"]')
    expect(button.className).toMatch(/h-12/)
  })

  it('login card has full width on mobile with max-w constraint', () => {
    renderLogin()
    const card = document.querySelector('.max-w-\\[400px\\]')
    expect(card).toBeTruthy()
    expect(card.className).toMatch(/w-full/)
  })
})
