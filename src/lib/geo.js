export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = deg2rad(lat2 - lat1)
  const dLng = deg2rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function deg2rad(d) { return d * (Math.PI / 180) }

export function toGeoPoint(lat, lng) {
  return `POINT(${lng} ${lat})`
}

// Urban average driving speed (km/h) used for the v1 washer ETA.
// NOTE: ETA below is straight-line (haversine) distance ÷ average speed — it is NOT
// a real driving estimate. TODO: swap to a routing provider for true driving ETA
// (the deferred production routing swap).
export const AVG_WASHER_SPEED_KMH = 30

// etaMinutes(distanceKm, speedKmh?) -> whole minutes, or null.
//   null  when distanceKm is null/undefined (washer location unknown)
//   >= 1  otherwise (floors to a minimum of 1 so "0 min" never shows)
export function etaMinutes(distanceKm, speedKmh = AVG_WASHER_SPEED_KMH) {
  if (distanceKm == null) return null
  return Math.max(1, Math.round((distanceKm / speedKmh) * 60))
}

// lerpLatLng(a, b, t) -> { lat, lng } — linear interpolation between two points.
//   t = 0 -> a, t = 1 -> b. Used to tween the washer marker between GPS polls.
export function lerpLatLng(a, b, t) {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  }
}
