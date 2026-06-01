import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'
import he from '../../../i18n/locales/he.json'

const { profileRef } = vi.hoisted(() => ({ profileRef: { current: { nav_app_preference: 'waze' } } }))
vi.mock('../../../context/AuthContext.jsx', () => ({ useAuth: () => ({ profile: profileRef.current }) }))

import NavLauncher from '../NavLauncher.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, he: { translation: he } },
  lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
})

const JOB = { id: 'j1', lat: 32.05, lng: 34.80 }
function renderLauncher(activeJob = JOB) {
  return render(<I18nextProvider i18n={i18n}><NavLauncher activeJob={activeJob} /></I18nextProvider>)
}

beforeEach(() => { profileRef.current = { nav_app_preference: 'waze' } })

describe('NavLauncher', () => {
  it('renders an icon-only Waze launcher: logo img, aria-label, no "Waze" text', () => {
    renderLauncher()
    const link = screen.getByRole('link', { name: 'Open in Waze' })
    expect(link).toBeInTheDocument()
    expect(link.querySelector('img')).toBeTruthy()
    expect(screen.queryByText('Waze')).toBeNull()
  })

  it('deep-links to Waze with the job coords', () => {
    renderLauncher()
    const link = screen.getByRole('link', { name: 'Open in Waze' })
    expect(link.getAttribute('href')).toBe('https://waze.com/ul?ll=32.05,34.8&navigate=yes')
  })

  it('uses the Google Maps logo + deep-link when preference is google', () => {
    profileRef.current = { nav_app_preference: 'google' }
    renderLauncher()
    const link = screen.getByRole('link', { name: 'Open in Google Maps' })
    expect(link.querySelector('img')).toBeTruthy()
    expect(link.getAttribute('href')).toContain('google.com/maps/dir')
  })

  it('renders nothing without valid job coords', () => {
    const { container } = renderLauncher(null)
    expect(container.firstChild).toBeNull()
  })
})
