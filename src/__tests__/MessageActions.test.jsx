import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const reportSpy = vi.fn(() => Promise.resolve({ error: null }))
const blockSpy = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('../lib/moderation.js', () => ({
  reportMessage: (...a) => reportSpy(...a),
  blockUser: (...a) => blockSpy(...a),
}))
vi.mock('../components/ui/Toast.jsx', () => ({ useToast: () => () => {} }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }))

import MessageActions from '../components/chat/MessageActions.jsx'

beforeEach(() => { reportSpy.mockClear(); blockSpy.mockClear() })

describe('MessageActions', () => {
  it('renders nothing for the user\'s own message', () => {
    const { container } = render(<MessageActions reporterId="u1" reportedUserId="u1" context="order_chat" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('reports a message with the correct content_reports payload', async () => {
    render(<MessageActions reporterId="u1" reportedUserId="u2" context="order_chat" orderId="o1" messageId="m1" />)
    await userEvent.click(screen.getByRole('button', { name: 'moderation.actions' }))
    await userEvent.click(screen.getByText('moderation.report'))
    await waitFor(() => expect(reportSpy).toHaveBeenCalledWith({
      reporter_id: 'u1',
      reported_user_id: 'u2',
      context: 'order_chat',
      order_id: 'o1',
      message_id: 'm1',
      reason: 'reported_from_chat',
    }))
  })

  it('blocks a user (allowBlock) and calls onBlocked', async () => {
    const onBlocked = vi.fn()
    render(<MessageActions reporterId="u1" reportedUserId="u2" context="order_chat" allowBlock onBlocked={onBlocked} />)
    await userEvent.click(screen.getByRole('button', { name: 'moderation.actions' }))
    await userEvent.click(screen.getByText('moderation.block'))
    await waitFor(() => expect(blockSpy).toHaveBeenCalledWith('u1', 'u2'))
    await waitFor(() => expect(onBlocked).toHaveBeenCalledWith('u2'))
  })

  it('hides the block option when allowBlock is false (e.g. support chat)', async () => {
    render(<MessageActions reporterId="u1" reportedUserId="u2" context="support_chat" />)
    await userEvent.click(screen.getByRole('button', { name: 'moderation.actions' }))
    expect(screen.queryByText('moderation.block')).not.toBeInTheDocument()
    expect(screen.getByText('moderation.report')).toBeInTheDocument()
  })
})
