import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Drive the layer purely through the context value.
let mockBg = null
vi.mock('../context/BackgroundContext.jsx', () => ({
  useAdminBackground: () => mockBg,
}))

import AdminBackground from '../components/AdminBackground.jsx'

describe('AdminBackground layer', () => {
  it('renders the image layer at the stored opacity when enabled + url resolved', () => {
    mockBg = { enabled: true, imageUrl: 'https://signed/bg.jpg', opacity: 0.3 }
    render(<AdminBackground />)
    const layer = screen.getByTestId('admin-bg-image')
    expect(layer).toBeInTheDocument()
    expect(layer.style.backgroundImage).toContain('https://signed/bg.jpg')
    expect(layer.style.opacity).toBe('0.3')
  })

  it('renders the plain default (no image layer) when disabled', () => {
    mockBg = { enabled: false, imageUrl: 'https://signed/bg.jpg', opacity: 0.3 }
    render(<AdminBackground />)
    expect(screen.queryByTestId('admin-bg-image')).toBeNull()
  })

  it('renders the plain default when there is no image / url', () => {
    mockBg = { enabled: true, imageUrl: null, opacity: 0.15 }
    render(<AdminBackground />)
    expect(screen.queryByTestId('admin-bg-image')).toBeNull()
  })

  it('does not break when no provider is mounted (null context)', () => {
    mockBg = null
    render(<AdminBackground />)
    expect(screen.queryByTestId('admin-bg-image')).toBeNull()
  })
})
