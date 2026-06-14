import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import i18next from 'i18next'
import { MemoryRouter } from 'react-router-dom'
import he from '../i18n/locales/he.json'
import Landing from '../pages/Landing.jsx'

// Regression guard: the landing-page signup CTA must open the WelcomeIntroModal
// (the "30% off your first wash" joining-gift popup), NOT navigate straight to
// /signup. A past regression silently reverted the CTA to a direct link, hiding
// the promo. Pins the trigger so it can't break unnoticed.

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  lng: 'he',
  fallbackLng: 'he',
  resources: { he: { translation: he } },
  interpolation: { escapeValue: false },
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    <MemoryRouter>{children}</MemoryRouter>
  </I18nextProvider>
)

describe('Landing — first-wash discount intro popup', () => {
  it('opens the 30% gift popup when the signup CTA is clicked', async () => {
    const user = userEvent.setup()
    render(<Landing />, { wrapper })

    // The gift is not shown until the CTA is tapped.
    expect(screen.queryByText(he.landing.intro.giftText)).toBeNull()

    await user.click(screen.getByRole('button', { name: he.auth.signup }))

    await waitFor(() =>
      expect(screen.getByText(he.landing.intro.giftText)).toBeInTheDocument()
    )
  })
})
