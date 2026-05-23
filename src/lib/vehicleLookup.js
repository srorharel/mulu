const ENDPOINT    = 'https://data.gov.il/api/3/action/datastore_search'
const RESOURCE_ID = '053cea08-09bc-40ec-8f7a-156f0677aff3' // "כלי רכב פעילים" active vehicles

// Maps the registry's sug_degem (vehicle-type) field to our three pricing tiers.
// Anything not explicitly listed falls through to 'private'.
const SUG_DEGEM_MAP = {
  "ג'יפ": 'jeep',
  'מ"מ':  'pickup',  // משא קל — light goods vehicle
}

function detectCategory(record) {
  return SUG_DEGEM_MAP[(record.sug_degem ?? '').trim()] ?? 'private'
}

function normalizePlate(input) {
  return (input ?? '').replace(/\D/g, '')
}

const cache    = new Map()
const failures = new Map()
const FAILURE_COOLDOWN_MS = 60_000

// Call before retry() to bypass the 60-second failure cooldown.
export function clearPlateFailure(plate) {
  failures.delete(normalizePlate(plate))
}

export async function lookupPlate(plate) {
  const normalized = normalizePlate(plate)

  if (!normalized || normalized.length < 6) {
    return { status: 'invalid' }
  }

  if (cache.has(normalized)) {
    return cache.get(normalized)
  }

  const lastFailure = failures.get(normalized)
  if (lastFailure && Date.now() - lastFailure < FAILURE_COOLDOWN_MS) {
    return { status: 'error' }
  }

  const ctrl    = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 5000)

  const url = `${ENDPOINT}?resource_id=${RESOURCE_ID}&q=${normalized}&limit=1`

  try {
    const res = await fetch(url, { signal: ctrl.signal })

    if (!res.ok) {
      console.error('[lookupPlate] non-200 response:', res.status, res.statusText)
      failures.set(normalized, Date.now())
      return { status: 'error' }
    }

    const json = await res.json()

    if (!json?.success) {
      console.error('[lookupPlate] API returned success=false:', json?.error)
      return { status: 'error' }
    }

    const records = json?.result?.records ?? []

    if (records.length === 0) {
      const result = { status: 'not_found' }
      cache.set(normalized, result)
      return result
    }

    const record = records[0]

    const result = {
      status:   'found',
      plate:    normalized,
      make:     record.tozeret_nm?.trim()    ?? null,
      model:    record.kinuy_mishari?.trim() ?? null,
      year:     parseInt(record.shnat_yitzur, 10) || null,
      color:    record.tzeva_rechev?.trim()  ?? null,
      category: detectCategory(record),
    }

    cache.set(normalized, result)
    return result
  } catch (err) {
    console.error('[lookupPlate] fetch error:', err.message)
    failures.set(normalized, Date.now())
    return { status: 'error' }
  } finally {
    clearTimeout(timeout)
  }
}
