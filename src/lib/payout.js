// Tier → payout map (ILS, VAT-inclusive). Mirrors payout_for_tier() in the DB.
export const PAYOUT_BY_TIER = {
  1: 40,
  2: 45,
  3: 50,
  4: 55,
  5: 60,
}

export const UNRATED_PAYOUT   = 50 // 3★ equivalent for new washers
export const RATING_GATE_JOBS = 3  // rated jobs needed before tier is active

/**
 * Compute payout for a washer given their tier.
 * @param {number|null} tier - 1..5, or null if unrated
 * @returns {number} payout in ILS
 */
export function payoutForTier(tier) {
  if (tier == null) return UNRATED_PAYOUT
  return PAYOUT_BY_TIER[tier] ?? UNRATED_PAYOUT
}
