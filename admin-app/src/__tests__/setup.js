import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'

beforeEach(() => {
  try { sessionStorage.clear() } catch { /* ignore */ }
  try { localStorage.clear() } catch { /* ignore */ }
})
