/**
 * Capitalizes the first letter of each whitespace-separated word and
 * lowercases the rest. Hebrew and other non-Latin characters are unaffected
 * by case operations, so this is a safe no-op for Hebrew names.
 *
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function toTitleCase(name) {
  if (!name) return ''
  return name
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
