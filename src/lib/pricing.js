export const BASE_PRICES = {
  sedan:  { exterior: 60,  interior: 70,  full: 110 },
  suv:    { exterior: 75,  interior: 85,  full: 130 },
  pickup: { exterior: 80,  interior: 90,  full: 140 },
  van:    { exterior: 90,  interior: 100, full: 160 },
}

export const ADDON_PRICE = 20
export const PLATFORM_FEE_RATE = 0.15

// addons: { wiper_fluid?: boolean, tire_pressure?: boolean }
export function calcPrice(carType, serviceType, addons = {}) {
  const serviceBase = BASE_PRICES[carType]?.[serviceType]
  if (!serviceBase) throw new Error(`Invalid car/service: ${carType}/${serviceType}`)

  const addonTotal = (addons.wiper_fluid   ? ADDON_PRICE : 0)
                   + (addons.tire_pressure  ? ADDON_PRICE : 0)

  const base       = serviceBase + addonTotal
  const platformFee = parseFloat((base * PLATFORM_FEE_RATE).toFixed(2))
  const totalPrice  = parseFloat((base + platformFee).toFixed(2))

  return { basePrice: base, platformFee, totalPrice }
}
