import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Force edit mode OFF for the first test (default), then ON for the second.
const editMode = { current: false }
vi.mock('../lib/designEditMode.js', () => ({
  isDesignEditMode: () => editMode.current,
  exitDesignEditMode: () => {},
}))

// Provide a fake context with one override.
const overrideMap = new Map([
  ['has.override', { color: '#abc', padding: 12 }],
])
vi.mock('../context/DesignOverridesContext.jsx', () => ({
  useDesignOverride: (id) => overrideMap.get(id),
}))

import Editable from '../components/editable/Editable.jsx'

beforeEach(() => { editMode.current = false })

describe('Editable', () => {
  it('applies override style to the child when override exists', () => {
    render(
      <Editable id="has.override">
        <button>Click me</button>
      </Editable>
    )
    const btn = screen.getByText('Click me')
    expect(btn.style.color).toBe('rgb(170, 187, 204)')
    expect(btn.style.padding).toBe('12px')
  })
  it('renders the child unchanged when no override matches', () => {
    render(
      <Editable id="no.match">
        <button>Plain</button>
      </Editable>
    )
    const btn = screen.getByText('Plain')
    expect(btn.style.color).toBe('')
    expect(btn.style.padding).toBe('')
  })
  it('adds data-editable-id and outline classes in edit mode', () => {
    editMode.current = true
    render(
      <Editable id="has.override">
        <button>Edit mode</button>
      </Editable>
    )
    const btn = screen.getByText('Edit mode')
    expect(btn.getAttribute('data-editable-id')).toBe('has.override')
    expect(btn.className).toMatch(/outline/)
    expect(btn.className).toMatch(/hover:outline-amber-400/)
  })
})
