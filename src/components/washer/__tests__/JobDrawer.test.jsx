import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useMotionValue } from 'framer-motion'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../../i18n/locales/en.json'
import he from '../../../i18n/locales/he.json'

// ── Module mocks (network-free render) ──────────────────────────────────────
vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: vi.fn(),
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) },
  },
  isSupabaseConfigured: false,
}))

vi.mock('../../../hooks/useRealtimeOrder.js', () => ({
  useRealtimeOrder: () => ({ order: null, loading: false, error: null, mutateOrder: vi.fn() }),
}))

// Avoid Nominatim network from JobCard / ActiveJobPanel.
vi.mock('../../../lib/geocode.js', () => ({
  useReverseGeocode: () => ({ address: '', loading: false }),
  looksLikeCoords: () => false,
  reverseGeocode: async () => null,
  forwardGeocode: async () => null,
}))

vi.mock('../../ui/Toast.jsx', () => ({
  useToast: () => vi.fn(),
  ToastProvider: ({ children }) => children,
}))

// Design-editor wrapper → render the child straight through.
vi.mock('../../editable/Editable.jsx', () => ({ default: ({ children }) => children }))

import JobDrawer, { getSnaps } from '../JobDrawer.jsx'
import RecenterButton from '../RecenterButton.jsx'

// ── i18n (real bundles, Hebrew) ─────────────────────────────────────────────
const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, he: { translation: he } },
  lng: 'he',
  fallbackLng: 'he',
  supportedLngs: ['en', 'he'],
  interpolation: { escapeValue: false },
})

function job(id, overrides = {}) {
  return {
    id,
    status: 'pending',
    car_type: 'sedan',
    service_type: 'wash',
    base_price: 50,
    distance_km: 1.2,
    lat: 32.08,
    lng: 34.78,
    created_at: '2026-06-01T10:00:00.000Z',
    ...overrides,
  }
}

// Harness owns the shared drawer motion value + snaps (as Dashboard does).
function DrawerHarness({ jobs }) {
  const snaps = getSnaps()
  const drawerY = useMotionValue(snaps.default)
  return (
    <JobDrawer
      jobs={jobs}
      loading={false}
      selectedJobId={null}
      online
      onToggle={() => {}}
      toggling={false}
      activeJob={null}
      onJobDone={() => {}}
      position={{ lat: 32.0, lng: 34.8 }}
      drawerY={drawerY}
      snaps={snaps}
    />
  )
}

function renderDrawer(jobs) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <DrawerHarness jobs={jobs} />
      </MemoryRouter>
    </I18nextProvider>
  )
}

beforeEach(() => { vi.clearAllMocks() })

// ── Part B: Hebrew count subtitle (no raw i18n key) ─────────────────────────
describe('JobDrawer — nearby-jobs count subtitle (Hebrew)', () => {
  it('renders the translated count, not the raw key, for 2 jobs (Hebrew _two)', () => {
    const { container } = renderDrawer([job('a'), job('b')])

    // The raw key must never leak to the DOM.
    expect(container.textContent).not.toContain('jobsNearbyCount')
    expect(container.textContent).not.toContain('washer.drawer.jobs')

    // count===2 → Hebrew `two` plural.
    expect(screen.getByText('שתי עבודות בסביבה')).toBeInTheDocument()
  })

  it('renders the translated count for a single job (Hebrew _one)', () => {
    const { container } = renderDrawer([job('solo')])
    expect(container.textContent).not.toContain('jobsNearbyCount')
    expect(screen.getByText('עבודה אחת בסביבה')).toBeInTheDocument()
  })
})

// ── Part A: recenter button placement + drawer-tracking wiring ──────────────
describe('RecenterButton — recenter map control', () => {
  function RecenterHarness({ y = 200, expandedH = 1000, visible = true, onRecenter = () => {} }) {
    const drawerY = useMotionValue(y)
    return <RecenterButton drawerY={drawerY} expandedH={expandedH} visible={visible} onRecenter={onRecenter} />
  }

  function renderRecenter(props) {
    return render(
      <I18nextProvider i18n={i18n}>
        <RecenterHarness {...props} />
      </I18nextProvider>
    )
  }

  it('renders with the data-testid and calls the recenter handler exactly once on click', () => {
    const onRecenter = vi.fn()
    renderRecenter({ onRecenter })
    const btn = screen.getByTestId('recenter-btn')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onRecenter).toHaveBeenCalledTimes(1)
  })

  it('is hidden when not visible (e.g. an active job owns the screen)', () => {
    renderRecenter({ visible: false })
    expect(screen.queryByTestId('recenter-btn')).not.toBeInTheDocument()
  })

  it('anchors to the physical-left edge (intentional non-flipping map control)', () => {
    renderRecenter({})
    const btn = screen.getByTestId('recenter-btn')
    expect(btn.style.left).toBe('1rem')
    // No physical-right / logical-end positioning.
    expect(btn.style.right).toBe('')
    expect(btn.style.insetInlineEnd).toBe('')
  })

  it('derives its bottom from the shared drawer motion value + CSS vars, not a static offset', () => {
    // Two instances with different drawer-y values must yield different bottoms,
    // both composed from --nav-height + --stack-gap (safe-area-aware, per §11).
    const { unmount } = renderRecenter({ y: 200, expandedH: 1000 })
    const bottomA = screen.getByTestId('recenter-btn').style.bottom
    unmount()

    renderRecenter({ y: 600, expandedH: 1000 })
    const bottomB = screen.getByTestId('recenter-btn').style.bottom

    for (const b of [bottomA, bottomB]) {
      expect(b).toContain('calc(')
      expect(b).toContain('var(--nav-height')
      expect(b).toContain('var(--stack-gap')
    }
    // expandedH - y :  1000-200=800  vs  1000-600=400  → tracks the drawer value.
    expect(bottomA).toContain('800px')
    expect(bottomB).toContain('400px')
    expect(bottomA).not.toBe(bottomB)
  })
})
