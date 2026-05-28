import '@testing-library/jest-dom'
import { beforeEach } from 'vitest'

// Reset browser storage between tests so a component that persists state to
// sessionStorage / localStorage (e.g. SignUp.jsx writes washer_signup_draft on
// every render) can't leak state into the next test. The washerSignup.test.jsx
// regressions in 2026-05 traced back to exactly this kind of pollution.
beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})
