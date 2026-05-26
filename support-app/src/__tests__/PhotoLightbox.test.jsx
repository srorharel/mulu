import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('framer-motion', () => {
  const React = require('react')
  return {
    motion: new Proxy({}, {
      get: (_target, tag) => React.forwardRef((props, ref) => React.createElement(tag, { ...props, ref })),
    }),
    AnimatePresence: ({ children }) => children,
  }
})

import PhotoLightbox from '../components/PhotoLightbox.jsx'

const photos = [
  { url: 'https://example.com/a.jpg', label: 'Front' },
  { url: 'https://example.com/b.jpg', label: 'Back' },
]

describe('PhotoLightbox', () => {
  it('renders nothing when index is null', () => {
    const { container } = render(
      <PhotoLightbox photos={photos} index={null} onClose={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the photo when index is set', () => {
    render(<PhotoLightbox photos={photos} index={0} onClose={() => {}} />)
    expect(screen.getByAltText('Front')).toBeInTheDocument()
  })

  it('renders into document.body via portal (not inside its parent)', () => {
    const { container } = render(
      <div data-testid="parent">
        <PhotoLightbox photos={photos} index={0} onClose={() => {}} />
      </div>,
    )
    const parent = container.querySelector('[data-testid="parent"]')
    expect(parent.querySelector('img')).toBeNull()
    expect(document.querySelector('img[alt="Front"]')).toBeInTheDocument()
  })

  it('uses z-index 99999 to beat Leaflet panes', () => {
    render(<PhotoLightbox photos={photos} index={0} onClose={() => {}} />)
    const overlay = document.querySelector('img[alt="Front"]').closest('[style*="z-index"]')
    expect(overlay.style.zIndex).toBe('99999')
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    render(<PhotoLightbox photos={photos} index={0} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('locks body scroll while open', () => {
    const { unmount } = render(<PhotoLightbox photos={photos} index={0} onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('navigates between photos via arrow keys when onNavigate provided', () => {
    const onNavigate = vi.fn()
    render(
      <PhotoLightbox
        photos={photos}
        index={0}
        onClose={() => {}}
        onNavigate={onNavigate}
      />,
    )
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(onNavigate).toHaveBeenCalledWith(1)
  })

  it('clamps navigation at boundaries', () => {
    const onNavigate = vi.fn()
    render(
      <PhotoLightbox
        photos={photos}
        index={0}
        onClose={() => {}}
        onNavigate={onNavigate}
      />,
    )
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(onNavigate).toHaveBeenCalledWith(0)
  })

  it('shows counter for multiple photos', () => {
    render(<PhotoLightbox photos={photos} index={0} onClose={() => {}} />)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('shows nav arrows for multiple photos when onNavigate provided', () => {
    render(
      <PhotoLightbox photos={photos} index={0} onClose={() => {}} onNavigate={() => {}} />,
    )
    expect(screen.getByLabelText('Previous photo')).toBeInTheDocument()
    expect(screen.getByLabelText('Next photo')).toBeInTheDocument()
  })
})
