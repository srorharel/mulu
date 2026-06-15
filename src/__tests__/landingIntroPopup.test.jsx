import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import i18next from 'i18next'
import { MemoryRouter } from 'react-router-dom'
import he from '../i18n/locales/he.json'
import Landing from '../pages/Landing.jsx'

// Regression guard: the landing-page signup CTA must open the WelcomeIntroModal
// ("about us" screen) and let the user pick a role, NOT navigate straight to a
// signup form. A past regression silently reverted the CTA to a direct link;
// this pins that the modal — now the role chooser that splits the two
// registrations — opens on tap.

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

describe('Landing — about-us / role-choice intro popup', () => {
  it('opens the role chooser when the signup CTA is clicked', async () => {
    const user = userEvent.setup()
    render(<Landing />, { wrapper })

    // The role options are not shown until the CTA is tapped.
    expect(screen.queryByText(he.landing.intro.roleWasher)).toBeNull()

    await user.click(screen.getByRole('button', { name: he.landing.ctaStart }))

    await waitFor(() => {
      expect(screen.getByText(he.landing.intro.roleCustomer)).toBeInTheDocument()
      expect(screen.getByText(he.landing.intro.roleWasher)).toBeInTheDocument()
    })
  })
})
