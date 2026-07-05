// frontend/src/composables/useScaledQuantity.test.ts
import { describe, expect, it } from 'vitest'
import { scaleQuantity } from './useScaledQuantity'

describe('scaleQuantity', () => {
  // The 5 explicit cases from the brief
  it('scales a plain integer and keeps whole-number results whole', () => {
    expect(scaleQuantity('2', 2)).toBe('4')
  })

  it('scales a decimal to a whole-number result without a trailing .0', () => {
    expect(scaleQuantity('1.5', 2)).toBe('3')
  })

  it('parses a unicode vulgar fraction glyph and scales it', () => {
    expect(scaleQuantity('½', 2)).toBe('1')
  })

  it('scales both ends of a range independently', () => {
    expect(scaleQuantity('2-3', 2)).toBe('4-6')
  })

  it('returns unparseable text unchanged', () => {
    expect(scaleQuantity('a pinch', 2)).toBe('a pinch')
  })

  // Additional cases covering the formatting/parsing spec
  it('returns an empty string unchanged', () => {
    expect(scaleQuantity('', 2)).toBe('')
  })

  it('parses a mixed number (integer + fraction glyph, no space)', () => {
    // "1½" = 1.5, scaled by 2 = 3
    expect(scaleQuantity('1½', 2)).toBe('3')
  })

  it('renders a scaled result as a fraction glyph when it lands on a common fraction', () => {
    expect(scaleQuantity('1', 0.5)).toBe('½')
  })

  it('renders a mixed number as whole part + fraction glyph with no space', () => {
    expect(scaleQuantity('3', 0.5)).toBe('1½')
  })

  it('falls back to a trimmed short decimal when the result is not a common fraction', () => {
    // 1 * 0.3 = 0.3 (not a standard fraction glyph)
    expect(scaleQuantity('1', 0.3)).toBe('0.3')
  })

  it('scales a range where an end lands on a common fraction glyph', () => {
    expect(scaleQuantity('2-3', 0.5)).toBe('1-1½')
  })

  // Regression coverage for the fraction-match tolerance bug: 0.01 was wide
  // enough to misclassify a genuinely different decimal as a common fraction.
  it('does not misclassify a real decimal result as a nearby fraction glyph', () => {
    // 0.9 * 0.75 = 0.675, which is ~1.25% away from ⅔ (0.6667) — a real,
    // distinct quantity, not floating-point noise. Must fall back to decimal.
    expect(scaleQuantity('0.9', 0.75)).toBe('0.68')
  })

  it('still resolves genuine floating-point noise to the correct fraction glyph', () => {
    // 2 * (1/3) in JS floating point is 0.6666666666666666, not exactly 2/3,
    // but the difference is pure FP noise and should still match ⅔.
    expect(scaleQuantity('2', 1 / 3)).toBe('⅔')
  })
})
