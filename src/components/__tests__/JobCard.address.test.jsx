import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../i18n/locales/en.json'
import he from '../../i18n/locales/he.json'

// Reported bug (Jun 2026): a customer booked "אבן גבירול, תל אביב" but the washer's
// job card showed "אבן גבירול, חולון". The card was reverse-geocoding the pin
// coordinates (Nominatim resolves a Tel Aviv pin near the boundary to Holon, where
// the same street name also exists) instead of showing the address the customer
// actually confirmed (order.address_label). This pins the fix: address_label wins;
// reverse-geocode is only a fallback for legacy/coords-only labels.
//
// The mock always returns the WRONG city, so the card MUST ignore it when a real
// label is present.
vi.mock('../../lib/geocode.js', () => ({
  useReverseGeocode: () => ({ address: 'אבן גבירול, חולון', loading: false }),
  looksLikeCoords: s => /^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(String(s).trim()),
}))

import JobCard from '../JobCard.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, he: { translation: he } },
  lng: 'he',
  fallbackLng: 'he',
  supportedLngs: ['en', 'he'],
  interpolation: { escapeValue: false },
})

function renderCard(overrides = {}) {
  const job = {
    id: 'job-1',
    car_type: 'sedan',
    service_type: 'wash',
    base_price: 60,
    distance_km: 1.2,
    created_at: new Date().toISOString(),
    lat: 32.08,
    lng: 34.78,
    address_label: 'אבן גבירול, תל אביב',
    ...overrides,
  }
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <JobCard job={job} onClick={() => {}} />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('JobCard address', () => {
  it('shows the customer-confirmed address_label, not a reverse-geocode of the pin', () => {
    renderCard()
    expect(screen.getByText('אבן גבירול, תל אביב')).toBeInTheDocument()
    expect(screen.queryByText('אבן גבירול, חולון')).not.toBeInTheDocument()
  })

  it('falls back to reverse-geocode when the order has no label (legacy orders)', () => {
    renderCard({ address_label: null })
    expect(screen.getByText('אבן גבירול, חולון')).toBeInTheDocument()
  })

  it('falls back to reverse-geocode when the label is a coords-only string', () => {
    renderCard({ address_label: '32.0800, 34.7800' })
    expect(screen.getByText('אבן גבירול, חולון')).toBeInTheDocument()
    expect(screen.queryByText('32.0800, 34.7800')).not.toBeInTheDocument()
  })
})
