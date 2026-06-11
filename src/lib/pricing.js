// VAT rate as of Jan 2025. Change here if rate changes.
export const VAT_RATE = 0.18

// Per-category pricing (ILS, VAT-inclusive).
// consumer = what the customer pays
// worker   = what the washer earns
// platform = platform margin (consumer - worker)
export const PRICING = {
  private: { consumer: 100, worker: 60, platform: 40 },
  jeep:    { consumer: 120, worker: 80, platform: 40 },
  pickup:  { consumer: 130, worker: 90, platform: 40 },
}

export function priceForCategory(category) {
  return PRICING[category] || PRICING.private
}

// First-wash discount (ADR-040). Display-only mirror of the server-side
// validate_order_prices trigger (migration 0111) — the DB is the source of
// truth at insert time. Rounding matches SQL ROUND(total * 0.30, 2).
export const FIRST_WASH_DISCOUNT_PERCENT = 30

export function applyFirstWashDiscount(total) {
  const discount = Math.round(total * FIRST_WASH_DISCOUNT_PERCENT) / 100
  return { total: total - discount, discount }
}

export function priceBreakdown(totalIncludingVat) {
  const preVat = totalIncludingVat / (1 + VAT_RATE)
  const vat    = totalIncludingVat - preVat
  return {
    total:  totalIncludingVat,
    preVat: Math.round(preVat * 100) / 100,
    vat:    Math.round(vat   * 100) / 100,
  }
}

export function consumerBreakdown(category = 'private') {
  return priceBreakdown(priceForCategory(category).consumer)
}

export function workerBreakdown(category = 'private') {
  return priceBreakdown(priceForCategory(category).worker)
}
