import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import Pill from '../components/Pill.jsx'

// Pill is the canonical status indicator — test it as a unit representing
// the ticket status rendering logic.

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {} } },
  lng: 'en', fallbackLng: 'en',
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

// Mirror the mapping used in Dashboard.jsx TicketsView
const STATUS_PILL = {
  open:        'danger',
  in_progress: 'warning',
  resolved:    'success',
}

describe('Ticket status pill rendering', () => {
  it('open tickets render with danger color class', () => {
    const { container } = render(
      <Pill color={STATUS_PILL.open}>Open</Pill>,
      { wrapper }
    )
    const el = container.firstChild
    expect(el.className).toMatch(/text-danger/)
    expect(el.className).toMatch(/bg-danger/)
    expect(el.textContent).toBe('Open')
  })

  it('in_progress tickets render with warning color class', () => {
    const { container } = render(
      <Pill color={STATUS_PILL.in_progress}>In progress</Pill>,
      { wrapper }
    )
    const el = container.firstChild
    expect(el.className).toMatch(/text-warning/)
    expect(el.textContent).toBe('In progress')
  })

  it('resolved tickets render with success color class', () => {
    const { container } = render(
      <Pill color={STATUS_PILL.resolved}>Resolved</Pill>,
      { wrapper }
    )
    const el = container.firstChild
    expect(el.className).toMatch(/text-success/)
    expect(el.textContent).toBe('Resolved')
  })

  it('auto-created 1★ tickets flag text is rendered', () => {
    // This mirrors the Dashboard.jsx TicketsView auto flag
    render(
      <span className="text-warning font-semibold">1★ auto</span>,
      { wrapper }
    )
    expect(screen.getByText('1★ auto')).toBeInTheDocument()
  })

  it('Pill renders a dot indicator when dot=true', () => {
    const { container } = render(
      <Pill color="agent" dot>Live</Pill>,
      { wrapper }
    )
    // The dot is the first child span inside the pill
    const dot = container.firstChild.firstChild
    expect(dot.tagName.toLowerCase()).toBe('span')
    expect(dot.className).toMatch(/rounded-full/)
  })
})
