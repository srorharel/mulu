import { describe, it, expect } from 'vitest'

// Pure-function tests on segment shape — no Supabase round-trips.
// resolve_broadcast_segment behavior is asserted server-side via verify-db.

function valid(draft) {
  const required = ['title_en', 'title_he', 'body_en', 'body_he']
  if (required.some(k => !draft[k].trim())) return false
  if (draft.segment_type === 'single_user' && !draft.segment_payload.user_id) return false
  return true
}

describe('broadcast draft validation', () => {
  it('rejects an empty draft', () => {
    expect(valid({ title_en: '', title_he: '', body_en: '', body_he: '', segment_type: 'all_consumers', segment_payload: {} })).toBe(false)
  })
  it('requires all four bilingual fields', () => {
    expect(valid({ title_en: 'A', title_he: '', body_en: 'B', body_he: 'C', segment_type: 'all_consumers', segment_payload: {} })).toBe(false)
  })
  it('accepts a full draft for all_consumers', () => {
    expect(valid({ title_en: 'A', title_he: 'ב', body_en: 'B', body_he: 'ג', segment_type: 'all_consumers', segment_payload: {} })).toBe(true)
  })
  it('requires user_id for single_user', () => {
    const base = { title_en: 'A', title_he: 'ב', body_en: 'B', body_he: 'ג', segment_type: 'single_user', segment_payload: {} }
    expect(valid(base)).toBe(false)
    expect(valid({ ...base, segment_payload: { user_id: 'abc' } })).toBe(true)
  })
})
