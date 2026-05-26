import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from '../pages/Login.jsx'

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ signIn: vi.fn(), agentBlocked: false }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => opts?.defaultValue || key,
    i18n: { language: 'he' },
  }),
}))

describe('Login RTL mode', () => {
  it('login card has dir="rtl" when locale is Hebrew', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    const card = document.querySelector('[dir="rtl"]')
    expect(card).toBeTruthy()
  })

  it('desktop hero stays dir="ltr" even in Hebrew', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    const ltrBlock = document.querySelector('[dir="ltr"]')
    expect(ltrBlock).toBeTruthy()
    expect(ltrBlock.querySelector('h1')).toBeTruthy()
  })
})
