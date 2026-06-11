// supabase/functions/send-receipt/index.ts
//
// Emails a customer their receipt + wash confirmation (ADR-041). Invoked by:
//   • trg_issue_receipt_on_completion (orders → 'completed') via net.http_post
//   • admin_resend_receipt RPC (admin Receipts tab "resend" button)
//
// Auth mirrors the other fan-outs: Bearer token must equal TRIGGER_SECRET
// (the service role key), compared timing-safe. Body: { receipt_id }.
//
// The receipt row is a full snapshot (amounts, VAT split, business details,
// sender) taken at issue time — this function only renders + sends, it never
// recomputes. Delivery result is written back to receipts.status.
//
// Edge Function secrets required:
//   TRIGGER_SECRET   — service role key (same as fan-out-nearby-job etc.)
//   RESEND_API_KEY   — Resend API key; the sender domain must be verified
//                      in Resend or sends will fail with 'failed' status.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const aBytes = enc.encode(a)
  const bBytes = enc.encode(b)
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
  return diff === 0
}

const CAR_LABELS: Record<string, string> = {
  private: 'רכב פרטי',
  jeep:    "ג'יפ / SUV",
  pickup:  'פיקאפ',
  sedan:   'סדאן',
  suv:     "ג'יפ",
  van:     'ואן',
}

function ils(n: number): string {
  return `₪${Number(n).toFixed(2)}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// deno-lint-ignore no-explicit-any
function renderReceiptHtml(r: any): string {
  const issuedDate = new Date(r.created_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })
  const carLabel   = CAR_LABELS[r.car_type] ?? 'רכב'
  const name       = escapeHtml(r.consumer_name ?? '')
  const biz        = escapeHtml(r.business_name ?? 'MULU')
  const dealer     = escapeHtml(r.dealer_number ?? '')
  const address    = escapeHtml(r.business_address ?? '')
  const phone      = escapeHtml(r.business_phone ?? '')
  const footer     = escapeHtml(r.footer_text ?? '')
  const discount   = Number(r.discount_amount) > 0
    ? `<tr><td style="padding:6px 0;color:#16a34a;">הנחת שטיפה ראשונה</td><td style="padding:6px 0;color:#16a34a;text-align:left;">-${ils(r.discount_amount)}</td></tr>`
    : ''

  return `<!doctype html>
<html dir="rtl" lang="he">
<body style="margin:0;padding:24px;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e8e5;">
    <div style="background:#26b55f;padding:20px 24px;color:#ffffff;">
      <p style="margin:0;font-size:20px;font-weight:bold;">${biz}</p>
      <p style="margin:4px 0 0;font-size:13px;opacity:.9;">השטיפה שלך הושלמה ואושרה ✔</p>
    </div>

    <div style="padding:24px;">
      <p style="margin:0 0 4px;font-size:16px;">היי ${name},</p>
      <p style="margin:0 0 16px;font-size:13.5px;color:#555;">
        הרכב שלך (${carLabel}) נשטף, צולם לפני ואחרי, והשטיפה אושרה על־ידי הצוות שלנו.
        מצורפת הקבלה עבור ההזמנה.
      </p>

      <div style="border:1px solid #e3e8e5;border-radius:12px;padding:16px 20px;">
        <table style="width:100%;font-size:13px;color:#555;border-collapse:collapse;">
          <tr>
            <td style="padding:2px 0;"><b style="color:#1a1a1a;font-size:15px;">קבלה מס' ${r.receipt_number}</b></td>
            <td style="padding:2px 0;text-align:left;">תאריך: ${issuedDate}</td>
          </tr>
        </table>
        <hr style="border:none;border-top:1px solid #e3e8e5;margin:12px 0;" />
        <table style="width:100%;font-size:13.5px;border-collapse:collapse;">
          <tr><td style="padding:6px 0;">שטיפת רכב — ${carLabel}</td><td style="padding:6px 0;text-align:left;">${ils(Number(r.total) + Number(r.discount_amount))}</td></tr>
          ${discount}
          <tr><td style="padding:6px 0;color:#888;">לפני מע״מ</td><td style="padding:6px 0;text-align:left;color:#888;">${ils(r.pre_vat)}</td></tr>
          <tr><td style="padding:6px 0;color:#888;">מע״מ ${Number(r.vat_rate_percent)}%</td><td style="padding:6px 0;text-align:left;color:#888;">${ils(r.vat_amount)}</td></tr>
          <tr><td style="padding:10px 0 0;font-weight:bold;font-size:15px;border-top:1px solid #e3e8e5;">סה״כ ששולם</td><td style="padding:10px 0 0;text-align:left;font-weight:bold;font-size:15px;border-top:1px solid #e3e8e5;">${ils(r.total)}</td></tr>
        </table>
      </div>

      <div style="margin-top:16px;font-size:12px;color:#888;line-height:1.7;">
        <p style="margin:0;"><b>${biz}</b>${dealer ? ` · עוסק מורשה ${dealer}` : ''}</p>
        ${address ? `<p style="margin:0;">${address}</p>` : ''}
        ${phone ? `<p style="margin:0;">טלפון: ${phone}</p>` : ''}
        ${footer ? `<p style="margin:8px 0 0;">${footer}</p>` : ''}
      </div>
    </div>

    <div style="padding:14px 24px;background:#f8faf9;border-top:1px solid #e3e8e5;font-size:11.5px;color:#999;">
      תודה שבחרתם ב־${biz} 💚
    </div>
  </div>
</body>
</html>`
}

Deno.serve(async (req) => {
  const triggerSecret = Deno.env.get('TRIGGER_SECRET') ?? ''
  const authHeader    = req.headers.get('Authorization') ?? ''
  const bearerToken   = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!timingSafeEqual(bearerToken, triggerSecret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let receipt_id: string
  try {
    const body = await req.json()
    receipt_id = body.receipt_id
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!receipt_id) return new Response('Missing receipt_id', { status: 400 })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, triggerSecret)

  const { data: receipt, error } = await supabase
    .from('receipts').select('*').eq('id', receipt_id).single()
  if (error || !receipt) {
    return new Response(JSON.stringify({ error: 'receipt_not_found' }), { status: 404 })
  }

  async function markFailed(detail: string) {
    await supabase.from('receipts')
      .update({ status: 'failed', error_detail: detail })
      .eq('id', receipt_id)
  }

  if (!receipt.consumer_email) {
    await markFailed('no_consumer_email')
    return new Response(JSON.stringify({ sent: false, error: 'no_consumer_email' }), { status: 200 })
  }
  if (!receipt.sender_email) {
    await markFailed('no_sender_configured')
    return new Response(JSON.stringify({ sent: false, error: 'no_sender_configured' }), { status: 200 })
  }
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    await markFailed('no_resend_api_key')
    return new Response(JSON.stringify({ sent: false, error: 'no_resend_api_key' }), { status: 200 })
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    `${receipt.sender_name || receipt.business_name || 'MULU'} <${receipt.sender_email}>`,
      to:      [receipt.consumer_email],
      subject: `קבלה מס' ${receipt.receipt_number} — השטיפה שלך הושלמה ✔`,
      html:    renderReceiptHtml(receipt),
    }),
  })

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500)
    await markFailed(`resend_${res.status}: ${detail}`)
    console.error(`send-receipt: Resend rejected receipt ${receipt_id}:`, res.status, detail)
    return new Response(JSON.stringify({ sent: false, error: `resend_${res.status}` }), { status: 200 })
  }

  await supabase.from('receipts')
    .update({ status: 'sent', sent_at: new Date().toISOString(), error_detail: null })
    .eq('id', receipt_id)

  return new Response(JSON.stringify({ sent: true, receipt_number: receipt.receipt_number }), { status: 200 })
})
