// frontend/src/composables/useDateRange.test.ts
import { describe, expect, it } from 'vitest'
import { formatDateRange } from './useDateRange'

describe('formatDateRange', () => {
  it('formats a same-year range as "Mon D – Mon D" without raw ISO strings', () => {
    expect(formatDateRange('2026-06-21', '2026-06-28')).toBe('Jun 21 – Jun 28')
  })

  it('formats a range spanning a month boundary', () => {
    expect(formatDateRange('2026-06-29', '2026-07-06')).toBe('Jun 29 – Jul 6')
  })

  it('appends the year to both ends when the range spans a year boundary', () => {
    expect(formatDateRange('2025-12-29', '2026-01-05')).toBe('Dec 29, 2025 – Jan 5, 2026')
  })

  it('never renders a raw YYYY-MM-DD substring in the output', () => {
    const result = formatDateRange('2026-06-21', '2026-06-28')
    expect(result).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})
