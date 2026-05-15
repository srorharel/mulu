// VAT rate as of Jan 2025. Change here if rate changes.
export const VAT_RATE = 0.18

// Flat per-job pricing — both values include VAT.
export const CONSUMER_PRICE_ILS = 100
export const WORKER_PAYOUT_ILS  = 60

export function priceBreakdown(totalIncludingVat) {
  const preVat = totalIncludingVat / (1 + VAT_RATE)
  const vat    = totalIncludingVat - preVat
  return {
    total:  totalIncludingVat,
    preVat: Math.round(preVat * 100) / 100,
    vat:    Math.round(vat   * 100) / 100,
  }
}

export function consumerBreakdown() {
  return priceBreakdown(CONSUMER_PRICE_ILS)
}

export function workerBreakdown() {
  return priceBreakdown(WORKER_PAYOUT_ILS)
}
