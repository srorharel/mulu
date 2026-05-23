import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import EmojiPickerButton from '../components/chat/EmojiPickerButton.jsx'
import MessageComposer from '../components/MessageComposer.jsx'

// Mock emoji-picker-react — lightweight stub for unit tests
vi.mock('emoji-picker-react', () => ({
  default: ({ onEmojiClick }) => (
    <div data-testid="mock-emoji-picker">
      <button
        data-testid="pick-smiley"
        onClick={() => onEmojiClick({ emoji: '😀' })}
      >
        😀
      </button>
    </div>
  ),
}))

vi.mock('../lib/support.js', () => ({
  validateAttachment: vi.fn().mockReturnValue(null),
}))

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'chat.attach':      'Attach',
    'chat.placeholder': 'Type a message...',
    'chat.send':        'Send',
    'chat.closed':      'Closed',
  } } },
  lng: 'en', fallbackLng: 'en',
})

const wrapper = ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>

// ── EmojiPickerButton unit tests ─────────────────────────────────────────────

describe('EmojiPickerButton', () => {
  it('picker is hidden by default', () => {
    render(<EmojiPickerButton onEmojiSelect={vi.fn()} />)
    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument()
  })

  it('clicking the smile icon opens the picker', () => {
    render(<EmojiPickerButton onEmojiSelect={vi.fn()} />)
    fireEvent.click(screen.getByTestId('emoji-trigger'))
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
  })

  it('clicking outside closes the picker', () => {
    render(
      <div>
        <EmojiPickerButton onEmojiSelect={vi.fn()} />
        <div data-testid="outside">outside</div>
      </div>,
    )
    fireEvent.click(screen.getByTestId('emoji-trigger'))
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument()
  })

  it('pressing Escape closes the picker', () => {
    render(<EmojiPickerButton onEmojiSelect={vi.fn()} />)
    fireEvent.click(screen.getByTestId('emoji-trigger'))
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument()
  })

  it('selecting an emoji calls onEmojiSelect with the emoji character', () => {
    const onSelect = vi.fn()
    render(<EmojiPickerButton onEmojiSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('emoji-trigger'))
    fireEvent.click(screen.getByTestId('pick-smiley'))
    expect(onSelect).toHaveBeenCalledWith('😀')
  })

  it('selecting an emoji closes the picker', () => {
    render(<EmojiPickerButton onEmojiSelect={vi.fn()} />)
    fireEvent.click(screen.getByTestId('emoji-trigger'))
    fireEvent.click(screen.getByTestId('pick-smiley'))
    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument()
  })

  it('is disabled when disabled prop is true', () => {
    render(<EmojiPickerButton onEmojiSelect={vi.fn()} disabled />)
    expect(screen.getByTestId('emoji-trigger')).toBeDisabled()
  })
})

// ── MessageComposer emoji integration ────────────────────────────────────────

describe('MessageComposer — emoji insertion', () => {
  it('emoji trigger button is present in the composer', () => {
    render(<MessageComposer onSend={vi.fn()} disabled={false} />, { wrapper })
    expect(screen.getByTestId('emoji-trigger')).toBeInTheDocument()
  })

  it('selecting emoji inserts it into the textarea', async () => {
    render(<MessageComposer onSend={vi.fn()} disabled={false} />, { wrapper })

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Hello' } })

    fireEvent.click(screen.getByTestId('emoji-trigger'))
    fireEvent.click(screen.getByTestId('pick-smiley'))

    // Emoji appears in textarea (position depends on selectionStart, which defaults to 0 in jsdom)
    expect(textarea.value).toContain('😀')
    expect(textarea.value).toContain('Hello')
  })

  it('sending message with emoji passes emoji in body', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageComposer onSend={onSend} disabled={false} />, { wrapper })

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Hi 😀' } })

    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await act(async () => {})

    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ body: 'Hi 😀' }))
  })

  it('emoji picker is disabled when composer is disabled', () => {
    render(<MessageComposer onSend={vi.fn()} disabled />, { wrapper })
    expect(screen.getByTestId('emoji-trigger')).toBeDisabled()
  })
})
