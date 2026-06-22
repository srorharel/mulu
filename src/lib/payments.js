import { supabase } from './supabase.js'

// Columns the client is allowed to read. NEVER includes provider_token — the
// column GRANT in migration 0128 denies it to authenticated, and charging is
// done server-side by the charge-saved-card Edge Function, so the browser never
// needs (or can read) the token.
const SAFE_COLS = 'id, provider, brand, last4, exp_month, exp_year, is_default, created_at'

export async function listSavedCards() {
  const { data, error } = await supabase
    .from('payment_methods')
    .select(SAFE_COLS)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
  return { data: data ?? [], error }
}

export async function deleteSavedCard(id) {
  return supabase.from('payment_methods').delete().eq('id', id)
}

export async function setDefaultCard(id) {
  return supabase.rpc('set_default_payment_method', { p_id: id })
}

// Charge a saved card for a pending order — server-side via the Edge Function.
// Returns { ok, error?, already_paid? }.
export async function chargeSavedCard(orderId, paymentMethodId) {
  const { data, error } = await supabase.functions.invoke('charge-saved-card', {
    body: { order_id: orderId, payment_method_id: paymentMethodId },
  })
  return error ? { ok: false, error } : (data ?? { ok: false, error: 'no_response' })
}

// Persist a token the checkout iframe handed back (client-initiated save path).
export async function saveCardFromToken(payload) {
  const { data, error } = await supabase.functions.invoke('save-card', { body: payload })
  return error ? { ok: false, error } : (data ?? { ok: false })
}

// Scaffold-mode payment confirm — marks the caller's own pending order paid so it
// enters the washer pool, mirroring a real charge. The RPC refuses once payments
// go live (app_config.payments_live = true), at which point the verified clearing
// charge becomes the only thing that sets paid_at. Returns { ok, error? }.
export async function confirmScaffoldPayment(orderId) {
  const { error } = await supabase.rpc('confirm_scaffold_payment', { p_order_id: orderId })
  return error ? { ok: false, error } : { ok: true }
}

// "•••• 4242 · Visa"
export function cardLabel(card) {
  const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : ''
  return `•••• ${card.last4 ?? '----'}${brand ? ' · ' + brand : ''}`
}
