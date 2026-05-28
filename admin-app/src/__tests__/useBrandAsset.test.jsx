import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import useBrandAsset, { _internals } from '../../../src/hooks/useBrandAsset.js'

function makeClient(rowOrNull) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(rowOrNull ? { data: rowOrNull, error: null } : { data: null, error: null }),
        }),
      }),
    }),
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: vi.fn(),
  }
}

function Probe({ slug, fallback, supabase }) {
  const url = useBrandAsset(slug, fallback, supabase)
  return <span data-testid="url">{url}</span>
}

beforeEach(() => {
  try { localStorage.clear() } catch { /* noop */ }
})

describe('useBrandAsset', () => {
  it('returns the fallback initially when no cache exists', () => {
    const client = makeClient(null)
    render(<Probe slug="main_logo" fallback="/logo.png" supabase={client} />)
    expect(screen.getByTestId('url').textContent).toBe('/logo.png')
  })

  it('serves cached URL synchronously on first paint', () => {
    localStorage.setItem(_internals.cacheKey('main_logo'), 'https://cdn/cached.png')
    const client = makeClient(null)
    render(<Probe slug="main_logo" fallback="/logo.png" supabase={client} />)
    expect(screen.getByTestId('url').textContent).toBe('https://cdn/cached.png')
  })

  it('reverts to fallback when no override row exists on the server', async () => {
    localStorage.setItem(_internals.cacheKey('main_logo'), 'https://cdn/stale.png')
    const client = makeClient(null) // no row
    render(<Probe slug="main_logo" fallback="/logo.png" supabase={client} />)
    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('/logo.png'))
    // Cache cleared, too.
    expect(localStorage.getItem(_internals.cacheKey('main_logo'))).toBeNull()
  })

  it('updates to the server URL when override row exists', async () => {
    const client = makeClient({ url: 'https://cdn/new.png' })
    render(<Probe slug="main_logo" fallback="/logo.png" supabase={client} />)
    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('https://cdn/new.png'))
  })

  it('keeps fallback when supabase is null (stub)', () => {
    render(<Probe slug="main_logo" fallback="/logo.png" supabase={null} />)
    expect(screen.getByTestId('url').textContent).toBe('/logo.png')
  })
})
