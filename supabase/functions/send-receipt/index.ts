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
import { PDFDocument, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1'
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

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

// ── PDF (חשבונית מס/קבלה) ────────────────────────────────────────────────────
// Built with pdf-lib + the Alef font (Hebrew + Latin coverage; the 14 built-in
// PDF fonts have no Hebrew glyphs). Fonts are fetched once per isolate from
// jsdelivr and cached at module scope.

const FONT_URLS = {
  regular: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/alef/Alef-Regular.ttf',
  bold:    'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/alef/Alef-Bold.ttf',
}
let fontCache: Promise<{ regular: Uint8Array; bold: Uint8Array }> | null = null
function loadFonts() {
  fontCache ??= (async () => {
    const fetchFont = async (url: string) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`font_fetch_${res.status}: ${url}`)
      return new Uint8Array(await res.arrayBuffer())
    }
    try {
      const [regular, bold] = await Promise.all([fetchFont(FONT_URLS.regular), fetchFont(FONT_URLS.bold)])
      return { regular, bold }
    } catch (e) {
      fontCache = null // allow a retry on the next invocation
      throw e
    }
  })()
  return fontCache
}

// Bidi note: fontkit (which pdf-lib uses to lay out custom-font text) detects
// the script from the FIRST strong character and reverses the whole glyph run
// when it is RTL. So pure-Hebrew strings must be passed in LOGICAL order —
// fontkit renders them correctly. What it canNOT do is mixed content: a
// Hebrew line containing numbers/Latin gets reversed wholesale, mangling the
// digits. Fix: split each line into directional segments, hand each segment
// to fontkit separately (Hebrew logical, LTR as-is), and place the segments
// right-to-left ourselves.
const HEB_RE = /[֐-׿]/
const LTR_SEG_RE = /[A-Za-z0-9₪@._]+(?:[.,:/-][A-Za-z0-9₪@._]+)*/g
// fontkit reverses RTL runs but does not mirror brackets — pre-swap them.
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' }

function segmentLine(line: string): { text: string; ltr: boolean }[] {
  const segs: { text: string; ltr: boolean }[] = []
  let last = 0
  for (const m of line.matchAll(LTR_SEG_RE)) {
    const i = m.index ?? 0
    if (i > last) segs.push({ text: line.slice(last, i), ltr: false })
    segs.push({ text: m[0], ltr: true })
    last = i + m[0].length
  }
  if (last < line.length) segs.push({ text: line.slice(last), ltr: false })
  return segs.map(s => s.ltr ? s : { ...s, text: [...s.text].map(c => MIRROR[c] ?? c).join('') })
}

// deno-lint-ignore no-explicit-any
async function buildInvoicePdf(r: any): Promise<Uint8Array> {
  const fonts = await loadFonts()
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const reg  = await doc.embedFont(fonts.regular, { subset: true })
  const bold = await doc.embedFont(fonts.bold,    { subset: true })

  // Fall back to ש"ח if the font has no ₪ glyph (renders as .notdef boxes).
  let hasShekel = true
  try {
    // deno-lint-ignore no-explicit-any
    hasShekel = (fontkit as any).create(fonts.regular).hasGlyphForCodePoint(0x20AA)
  } catch { /* keep optimistic default */ }
  const money = (n: number | string) =>
    hasShekel ? `₪${Number(n).toFixed(2)}` : `${Number(n).toFixed(2)} ש"ח`

  const page = doc.addPage([595.28, 841.89]) // A4
  const W = 595.28
  const RIGHT = W - 48, LEFT = 48
  const GREEN = rgb(0.149, 0.71, 0.373), INK = rgb(0.1, 0.1, 0.1)
  const MUTED = rgb(0.45, 0.45, 0.45), EDGE = rgb(0.85, 0.89, 0.87)

  // Draw a line as an RTL paragraph whose RIGHT edge sits at xRight: walk the
  // logical segments, placing each one immediately to the LEFT of the
  // previous. Hebrew segments go to fontkit in logical order (it reverses
  // them itself); LTR segments render untouched.
  // deno-lint-ignore no-explicit-any
  const drawRtlFlow = (text: string, xRight: number, y: number, font: any, size: number, color: any) => {
    let edge = xRight
    for (const seg of segmentLine(text)) {
      const w = font.widthOfTextAtSize(seg.text, size)
      page.drawText(seg.text, { x: edge - w, y, size, font, color })
      edge -= w
    }
  }
  // deno-lint-ignore no-explicit-any
  const drawR = (text: string, y: number, opts: { font?: any; size?: number; color?: any; x?: number } = {}) => {
    const { font = reg, size = 11, color = INK, x = RIGHT } = opts
    if (HEB_RE.test(text)) drawRtlFlow(text, x, y, font, size, color)
    else page.drawText(text, { x: x - font.widthOfTextAtSize(text, size), y, size, font, color })
  }
  // deno-lint-ignore no-explicit-any
  const drawL = (text: string, y: number, opts: { font?: any; size?: number; color?: any; x?: number } = {}) => {
    const { font = reg, size = 11, color = INK, x = LEFT } = opts
    if (HEB_RE.test(text)) drawRtlFlow(text, x + font.widthOfTextAtSize(text, size), y, font, size, color)
    else page.drawText(text, { x, y, size, font, color })
  }
  const hline = (y: number) =>
    page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.7, color: EDGE })

  const issuedDate = new Date(r.created_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })
  const carLabel = CAR_LABELS[r.car_type] ?? 'רכב'
  const gross = Number(r.total) + Number(r.discount_amount)

  // Header band
  page.drawRectangle({ x: 0, y: 770, width: W, height: 71.89, color: GREEN })
  drawR(r.business_name || 'MULU', 810, { font: bold, size: 22, color: rgb(1, 1, 1) })
  drawR('חשבונית מס/קבלה', 786, { size: 12, color: rgb(1, 1, 1) })
  drawL('מקור', 810, { font: bold, size: 12, color: rgb(1, 1, 1) })

  // Document line
  drawR(`חשבונית מס/קבלה מס' ${r.receipt_number}`, 730, { font: bold, size: 15 })
  drawL(`תאריך: ${issuedDate}`, 730, { size: 11, color: MUTED })

  // Business block
  let y = 700
  if (r.dealer_number)    { drawR(`עוסק מורשה ${r.dealer_number}`, y, { size: 11, color: MUTED }); y -= 16 }
  if (r.business_address) { drawR(r.business_address, y, { size: 11, color: MUTED }); y -= 16 }
  if (r.business_phone)   { drawR(`טלפון: ${r.business_phone}`, y, { size: 11, color: MUTED }); y -= 16 }

  // Customer block
  y -= 14
  drawR('לכבוד:', y, { font: bold, size: 11 }); y -= 16
  if (r.consumer_name)  { drawR(r.consumer_name, y, { size: 11 }); y -= 16 }
  if (r.consumer_email) { drawR(r.consumer_email, y, { size: 10, color: MUTED }); y -= 16 }

  // Items table
  y -= 18
  drawR('תיאור', y, { font: bold, size: 11, color: MUTED })
  drawL('סכום', y, { font: bold, size: 11, color: MUTED })
  y -= 8; hline(y); y -= 20
  drawR(`שטיפת רכב — ${carLabel}`, y); drawL(money(gross), y); y -= 20
  if (Number(r.discount_amount) > 0) {
    const DISC = rgb(0.086, 0.64, 0.29)
    drawR('הנחת שטיפה ראשונה', y, { color: DISC })
    drawL(`-${money(r.discount_amount)}`, y, { color: DISC })
    y -= 20
  }
  y -= 4; hline(y); y -= 20
  drawR('סה"כ לפני מע"מ', y, { color: MUTED }); drawL(money(r.pre_vat), y, { color: MUTED }); y -= 18
  drawR(`מע"מ ${Number(r.vat_rate_percent)}%`, y, { color: MUTED }); drawL(money(r.vat_amount), y, { color: MUTED }); y -= 10
  hline(y); y -= 22
  drawR('סה"כ ששולם', y, { font: bold, size: 14 }); drawL(money(r.total), y, { font: bold, size: 14 }); y -= 30

  // Wash confirmation + footer
  drawR('השטיפה הושלמה ואושרה על ידי הצוות שלנו.', y, { size: 10, color: MUTED }); y -= 16
  if (r.footer_text) { drawR(r.footer_text, y, { size: 10, color: MUTED }); y -= 16 }

  page.drawRectangle({ x: 0, y: 0, width: W, height: 40, color: rgb(0.973, 0.98, 0.976) })
  drawR(`תודה שבחרתם ב-${r.business_name || 'MULU'}`, 16, { size: 9, color: MUTED })
  drawL('מסמך ממוחשב', 16, { size: 9, color: MUTED })

  return await doc.save()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// deno-lint-ignore no-explicit-any
function renderReceiptHtml(r: any, hasPdf = false): string {
  const issuedDate = new Date(r.created_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })
  const carLabel   = CAR_LABELS[r.car_type] ?? 'רכב'
  const name       = escapeHtml(r.consumer_name ?? '')
  const biz        = escapeHtml(r.business_name ?? 'MULU')
  const dealer     = escapeHtml(r.dealer_number ?? '')
  const address    = escapeHtml(r.business_address ?? '')
  const phone      = escapeHtml(r.business_phone ?? '')
  const footer     = escapeHtml(r.footer_text ?? '')
  const discount   = Number(r.discount_amount) > 0
    ? `<tr><td style="padding:6px 0;color:#16a34a;text-align:right;">הנחת שטיפה ראשונה</td><td style="padding:6px 0;color:#16a34a;text-align:left;">-${ils(r.discount_amount)}</td></tr>`
    : ''

  // Gmail strips <html>/<body> tags (and their dir attribute) when rendering,
  // so RTL must be declared on the INNER elements: dir="rtl" on every div and
  // table, plus explicit text-align:right. Amount cells stay text-align:left
  // (numbers on the left edge is the intended RTL layout).
  return `<!doctype html>
<html dir="rtl" lang="he">
<body dir="rtl" style="margin:0;padding:24px;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <div dir="rtl" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e8e5;text-align:right;">
    <div dir="rtl" style="background:#26b55f;padding:20px 24px;color:#ffffff;text-align:right;">
      <p style="margin:0;font-size:20px;font-weight:bold;">${biz}</p>
      <p style="margin:4px 0 0;font-size:13px;opacity:.9;">השטיפה שלך הושלמה ואושרה ✔</p>
    </div>

    <div dir="rtl" style="padding:24px;text-align:right;">
      <p style="margin:0 0 4px;font-size:16px;">היי ${name},</p>
      <p style="margin:0 0 16px;font-size:13.5px;color:#555;">
        הרכב שלך (${carLabel}) נשטף, צולם לפני ואחרי, והשטיפה אושרה על־ידי הצוות שלנו.
        ${hasPdf ? 'חשבונית מס/קבלה מצורפת כקובץ PDF 📎' : 'מצורפת הקבלה עבור ההזמנה.'}
      </p>

      <div dir="rtl" style="border:1px solid #e3e8e5;border-radius:12px;padding:16px 20px;text-align:right;">
        <table dir="rtl" style="width:100%;font-size:13px;color:#555;border-collapse:collapse;text-align:right;">
          <tr>
            <td style="padding:2px 0;text-align:right;"><b style="color:#1a1a1a;font-size:15px;">קבלה מס' ${r.receipt_number}</b></td>
            <td style="padding:2px 0;text-align:left;">תאריך: ${issuedDate}</td>
          </tr>
        </table>
        <hr style="border:none;border-top:1px solid #e3e8e5;margin:12px 0;" />
        <table dir="rtl" style="width:100%;font-size:13.5px;border-collapse:collapse;text-align:right;">
          <tr><td style="padding:6px 0;text-align:right;">שטיפת רכב — ${carLabel}</td><td style="padding:6px 0;text-align:left;">${ils(Number(r.total) + Number(r.discount_amount))}</td></tr>
          ${discount}
          <tr><td style="padding:6px 0;color:#888;text-align:right;">לפני מע״מ</td><td style="padding:6px 0;text-align:left;color:#888;">${ils(r.pre_vat)}</td></tr>
          <tr><td style="padding:6px 0;color:#888;text-align:right;">מע״מ ${Number(r.vat_rate_percent)}%</td><td style="padding:6px 0;text-align:left;color:#888;">${ils(r.vat_amount)}</td></tr>
          <tr><td style="padding:10px 0 0;font-weight:bold;font-size:15px;border-top:1px solid #e3e8e5;text-align:right;">סה״כ ששולם</td><td style="padding:10px 0 0;text-align:left;font-weight:bold;font-size:15px;border-top:1px solid #e3e8e5;">${ils(r.total)}</td></tr>
        </table>
      </div>

      <div dir="rtl" style="margin-top:16px;font-size:12px;color:#888;line-height:1.7;text-align:right;">
        <p style="margin:0;"><b>${biz}</b>${dealer ? ` · עוסק מורשה ${dealer}` : ''}</p>
        ${address ? `<p style="margin:0;">${address}</p>` : ''}
        ${phone ? `<p style="margin:0;">טלפון: ${phone}</p>` : ''}
        ${footer ? `<p style="margin:8px 0 0;">${footer}</p>` : ''}
      </div>
    </div>

    <div dir="rtl" style="padding:14px 24px;background:#f8faf9;border-top:1px solid #e3e8e5;font-size:11.5px;color:#999;text-align:right;">
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

  // Build the חשבונית מס/קבלה PDF. A PDF failure degrades to a mail without
  // the attachment (noted in error_detail) rather than blocking the receipt.
  let pdfError: string | null = null
  // deno-lint-ignore no-explicit-any
  let attachments: any[] = []
  let pdfBytes: Uint8Array | null = null
  try {
    pdfBytes = await buildInvoicePdf(receipt)
    attachments = [{
      filename: `invoice-receipt-${receipt.receipt_number}.pdf`,
      content:  encodeBase64(pdfBytes),
    }]
  } catch (e) {
    pdfError = `pdf_skipped: ${String(e).slice(0, 300)}`
    console.error(`send-receipt: PDF build failed for ${receipt_id}:`, e)
  }

  // Archive the PDF to the private 'receipts' bucket BEFORE emailing (0114) —
  // retained bookkeeping copy, independent of email delivery. upsert keeps
  // admin resends idempotent (same path, same content).
  if (pdfBytes) {
    const year = new Date(receipt.created_at).getFullYear()
    const pdfPath = `${year}/invoice-receipt-${receipt.receipt_number}.pdf`
    const { error: upErr } = await supabase.storage
      .from('receipts')
      .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true })
    if (upErr) {
      pdfError = [pdfError, `backup_failed: ${String(upErr.message ?? upErr).slice(0, 200)}`]
        .filter(Boolean).join(' | ')
      console.error(`send-receipt: PDF backup failed for ${receipt_id}:`, upErr)
    } else {
      await supabase.from('receipts').update({ pdf_path: pdfPath }).eq('id', receipt_id)
    }
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
      subject: `חשבונית מס/קבלה מס' ${receipt.receipt_number} — השטיפה שלך הושלמה ✔`,
      html:    renderReceiptHtml(receipt, attachments.length > 0),
      attachments,
    }),
  })

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500)
    await markFailed(`resend_${res.status}: ${detail}`)
    console.error(`send-receipt: Resend rejected receipt ${receipt_id}:`, res.status, detail)
    return new Response(JSON.stringify({ sent: false, error: `resend_${res.status}` }), { status: 200 })
  }

  await supabase.from('receipts')
    .update({ status: 'sent', sent_at: new Date().toISOString(), error_detail: pdfError })
    .eq('id', receipt_id)

  return new Response(JSON.stringify({ sent: true, receipt_number: receipt.receipt_number, pdf: attachments.length > 0 }), { status: 200 })
})
