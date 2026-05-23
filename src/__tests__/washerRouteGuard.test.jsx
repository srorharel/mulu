import { describe, it, expect } from 'vitest'
import { washerVerificationRedirect } from '../components/RoleGuard.jsx'

describe('washerVerificationRedirect (pure function)', () => {
  it('returns /signup/washer/verify for null status on any non-signup route', () => {
    expect(washerVerificationRedirect(null, '/washer')).toBe('/signup/washer/verify')
    expect(washerVerificationRedirect(undefined, '/washer/earnings')).toBe('/signup/washer/verify')
  })

  it('returns /signup/washer/verify for pending_documents status', () => {
    expect(washerVerificationRedirect('pending_documents', '/washer')).toBe('/signup/washer/verify')
  })

  it('returns /signup/washer/pending for pending_review status', () => {
    expect(washerVerificationRedirect('pending_review', '/washer')).toBe('/signup/washer/pending')
  })

  it('returns /signup/washer/pending for rejected status on non-signup route', () => {
    expect(washerVerificationRedirect('rejected', '/washer')).toBe('/signup/washer/pending')
  })

  it('returns null for approved status (allow through)', () => {
    expect(washerVerificationRedirect('approved', '/washer')).toBeNull()
    expect(washerVerificationRedirect('approved', '/washer/earnings')).toBeNull()
  })

  it('allows pending_review on /signup/washer/pending', () => {
    expect(washerVerificationRedirect('pending_review', '/signup/washer/pending')).toBeNull()
  })

  it('redirects pending_review from /signup/washer/verify to /signup/washer/pending', () => {
    expect(washerVerificationRedirect('pending_review', '/signup/washer/verify')).toBe('/signup/washer/pending')
  })

  it('allows rejected on /signup/washer/verify (resubmit flow)', () => {
    expect(washerVerificationRedirect('rejected', '/signup/washer/verify')).toBeNull()
  })

  it('allows rejected on /signup/washer/pending', () => {
    expect(washerVerificationRedirect('rejected', '/signup/washer/pending')).toBeNull()
  })

  it('allows pending_documents on /signup/washer/verify', () => {
    expect(washerVerificationRedirect('pending_documents', '/signup/washer/verify')).toBeNull()
  })
})

describe('RoleGuard — washer verification redirect (pure logic via washerVerificationRedirect)', () => {
  it('washer + pending_documents → forced to /signup/washer/verify', () => {
    const dest = washerVerificationRedirect('pending_documents', '/washer')
    expect(dest).toBe('/signup/washer/verify')
  })

  it('washer + pending_review → forced to /signup/washer/pending', () => {
    const dest = washerVerificationRedirect('pending_review', '/washer/earnings')
    expect(dest).toBe('/signup/washer/pending')
  })

  it('washer + approved → /washer accessible (no redirect)', () => {
    const dest = washerVerificationRedirect('approved', '/washer')
    expect(dest).toBeNull()
  })
})
