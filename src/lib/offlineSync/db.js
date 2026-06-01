// IndexedDB durable store for the underground offline-capture queue (ADR-035).
//
// Photo evidence is stored as Blobs directly in IndexedDB — never localStorage,
// which can't hold binary reliably. One record per (orderId, type) pair so the
// store is naturally deduplicated and idempotent: re-capturing overwrites.
//
// Record shape (matches the ADR's queue schema):
//   { id: `${orderId}:${type}`, orderId, type: 'arrival'|'completion',
//     angles: { front?: Blob, back?: Blob, driver?: Blob, passenger?: Blob },
//     capturedAt: number, status: 'draft'|'queued'|'syncing'|'done'|'error' }

const DB_NAME    = 'mulu-offline-sync'
const DB_VERSION = 1
const STORE      = 'captures'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('orderId', 'orderId', { unique: false })
        store.createIndex('status',  'status',  { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
  return dbPromise
}

// Run a single store operation in its own transaction; resolve with the
// request's result once the transaction commits.
function run(mode, op) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t     = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    const req   = op(store)
    t.oncomplete = () => resolve(req ? req.result : undefined)
    t.onerror    = () => reject(t.error)
    t.onabort    = () => reject(t.error)
  }))
}

export const putCapture    = (record) => run('readwrite', s => s.put(record))
export const getCapture    = (id)     => run('readonly',  s => s.get(id))
export const getAllCaptures = ()      => run('readonly',  s => s.getAll())
export const deleteCapture = (id)     => run('readwrite', s => s.delete(id))

export async function setCaptureStatus(id, status) {
  const rec = await getCapture(id)
  if (!rec) return
  rec.status = status
  await putCapture(rec)
}

// Test-only: drop everything (used by the offline-engine suite between cases).
export const _clearAllCaptures = () => run('readwrite', s => s.clear())
