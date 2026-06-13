import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'en' } }),
}))
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ profile: { id: 'sa1', full_name: 'Super Admin' } }),
}))

const { state } = vi.hoisted(() => ({
  state: { configRows: [], receiptRows: [], updates: [], rpcCalls: [], signedUrlCalls: [] },
}))

vi.mock('../lib/supabase.js', () => {
  function thenable(result) {
    const b = {
      select: () => b, in: () => b, order: () => b, limit: () => b, eq: () => b,
      then: (cb) => Promise.resolve(result()).then(cb),
    }
    return b
  }
  return {
    supabase: {
      from: (table) => ({
        select: () => thenable(() => ({
          data: table === 'app_config' ? state.configRows : state.receiptRows,
          error: null,
        })),
        update: (payload) => ({
          eq: (col, val) => {
            state.updates.push({ table, payload, col, val })
            return Promise.resolve({ error: null })
          },
        }),
      }),
      rpc: (fn, args) => {
        state.rpcCalls.push({ fn, args })
        return Promise.resolve({ data: null, error: null })
      },
      storage: {
        from: (bucket) => ({
          createSignedUrl: (path, ttl) => {
            state.signedUrlCalls.push({ bucket, path, ttl })
            return Promise.resolve({ data: { signedUrl: `https://signed/${path}` }, error: null })
          },
        }),
      },
    },
  }
})

import Receipts, { RECEIPT_FIELDS } from '../pages/Receipts.jsx'

function cfg(key, value) {
  return { key, value: { value }, value_type: typeof value === 'number' ? 'number' : 'string', updated_at: null, editor: null }
}

beforeEach(() => {
  state.updates.length = 0
  state.rpcCalls.length = 0
  state.configRows = [
    cfg('receipts_enabled', 'true'),
    cfg('receipt_business_name', 'MULU'),
    cfg('receipt_dealer_number', ''),
    cfg('receipt_business_address', ''),
    cfg('receipt_business_phone', ''),
    cfg('receipt_sender_email', ''),
    cfg('receipt_sender_name', 'MULU'),
    cfg('receipt_footer_text', ''),
    cfg('receipt_vat_rate_percent', 18),
  ]
  state.signedUrlCalls.length = 0
  state.receiptRows = [
    { id: 'r1', receipt_number: 1002, consumer_name: 'Dana', consumer_email: 'dana@x.com',
      total: '70.00', discount_amount: '30.00', status: 'sent', error_detail: null,
      sent_at: '2026-06-11T10:00:00Z', created_at: '2026-06-11T10:00:00Z',
      pdf_path: '2026/invoice-receipt-1002.pdf' },
    { id: 'r2', receipt_number: 1001, consumer_name: 'Yossi', consumer_email: 'yossi@x.com',
      total: '100.00', discount_amount: '0.00', status: 'failed', error_detail: 'no_sender_configured',
      sent_at: null, created_at: '2026-06-10T09:00:00Z', pdf_path: null },
  ]
})

describe('admin Receipts — settings', () => {
  it('renders every configurable receipt field with its current value', async () => {
    render(<Receipts />)
    await screen.findByText('Receipt settings')
    for (const f of RECEIPT_FIELDS) {
      expect(screen.getByText(f.key)).toBeInTheDocument()
    }
    expect(screen.getByText(/עוסק מורשה/)).toBeInTheDocument()
    const nameRow = document.querySelector('[data-config-key="receipt_business_name"] input')
    expect(nameRow.value).toBe('MULU')
  })

  it('saves an edited field via app_config update with the {value:{value}} shape', async () => {
    render(<Receipts />)
    await screen.findByText('Receipt settings')
    const row = document.querySelector('[data-config-key="receipt_dealer_number"]')
    const input = row.querySelector('input')
    fireEvent.change(input, { target: { value: '516179157' } })
    fireEvent.click(row.querySelector('button[title="Save"]'))
    await waitFor(() => expect(state.updates.length).toBe(1))
    expect(state.updates[0]).toMatchObject({
      table: 'app_config', col: 'key', val: 'receipt_dealer_number',
      payload: expect.objectContaining({ value: { value: '516179157' } }),
    })
  })

  it('saves the VAT rate as a number, not a string', async () => {
    render(<Receipts />)
    await screen.findByText('Receipt settings')
    const row = document.querySelector('[data-config-key="receipt_vat_rate_percent"]')
    fireEvent.change(row.querySelector('input'), { target: { value: '17' } })
    fireEvent.click(row.querySelector('button[title="Save"]'))
    await waitFor(() => expect(state.updates.length).toBe(1))
    expect(state.updates[0].payload.value).toEqual({ value: 17 })
  })
})

describe('admin Receipts — issued list', () => {
  it('renders issued receipts with number, customer, and status', async () => {
    render(<Receipts />)
    expect((await screen.findAllByText('#1002')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('#1001').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Dana').length).toBeGreaterThan(0)
    expect(screen.getAllByText('sent').length).toBeGreaterThan(0)
    expect(screen.getAllByText('failed').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/no_sender_configured/).length).toBeGreaterThan(0)
  })

  it('download opens a signed URL from the private receipts bucket (only when a backup exists)', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<Receipts />)
    await screen.findAllByText('#1002')
    // r1 has a backed-up PDF, r2 does not — one button per layout (card + table)
    const pdfButtons = screen.getAllByTitle('Download PDF')
    expect(pdfButtons.length).toBe(2)
    fireEvent.click(pdfButtons[0])
    await waitFor(() => expect(state.signedUrlCalls.length).toBe(1))
    expect(state.signedUrlCalls[0]).toMatchObject({
      bucket: 'receipts', path: '2026/invoice-receipt-1002.pdf',
    })
    expect(openSpy).toHaveBeenCalledWith('https://signed/2026/invoice-receipt-1002.pdf', '_blank', 'noopener')
    openSpy.mockRestore()
  })

  it('resend calls the admin_resend_receipt RPC with the receipt id', async () => {
    render(<Receipts />)
    await screen.findAllByText('#1001')
    const resendButtons = screen.getAllByTitle('Resend email')
    fireEvent.click(resendButtons[0])
    await waitFor(() => expect(state.rpcCalls.length).toBe(1))
    expect(state.rpcCalls[0]).toEqual({
      fn: 'admin_resend_receipt',
      args: { p_receipt_id: 'r1' },
    })
  })
})
