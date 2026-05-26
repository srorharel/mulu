import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RootErrorBoundary } from '../RootErrorBoundary'

function Boom() {
  throw new Error('test crash')
}

describe('RootErrorBoundary', () => {
  it('catches render errors and shows recovery UI', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <RootErrorBoundary>
        <Boom />
      </RootErrorBoundary>,
    )
    expect(screen.getByText(/test crash/i)).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('renders children when no error', () => {
    render(
      <RootErrorBoundary>
        <div>ok</div>
      </RootErrorBoundary>,
    )
    expect(screen.getByText('ok')).toBeInTheDocument()
  })
})
