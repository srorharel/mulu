// Pure theme→map mapping helpers. Kept here (not inside WorkerMap.jsx) so they
// are unit-testable without Leaflet, which cannot render in jsdom.

const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

export function mapTiles(isDark) {
  return {
    url: isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTR,
    subdomains: 'abcd',
    maxZoom: 20,
  }
}

// Route polyline + accents: primary-500 pops on dark tiles but washes out on
// pale light tiles — use primary-700 there for AA-ish contrast. Keep dashArray
// identical (handled at the call site).
export function routeColor(isDark) {
  return isDark ? '#7DD9A2' : '#26B55F'
}

// Class hook applied to the Leaflet container so marker CSS can adapt per theme.
export function mapThemeClass(isDark) {
  return isDark ? 'map-dark' : 'map-light'
}
