// frontend/src/composables/useScaledQuantity.ts
//
// Pure helper for scaling freeform recipe ingredient quantity strings
// (e.g. "1½", "2-3", "1.5", "2") by a numeric factor. No Vue reactivity —
// a future component wraps this in `computed()` as needed (see Task 4.2).

/** Unicode vulgar fraction glyphs this helper understands, both for
 * parsing input and for rendering output. */
const FRACTION_GLYPHS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
}

// Ordered so that formatting checks the most common fractions first;
// tolerance-based matching below doesn't care about order, but keeping
// halves/quarters ahead of thirds avoids surprising glyph choices when
// two candidates are (implausibly) equally close.
const GLYPH_BY_VALUE: Array<[number, string]> = [
  [0.5, '½'],
  [0.25, '¼'],
  [0.75, '¾'],
  [1 / 3, '⅓'],
  [2 / 3, '⅔'],
]

const FRACTION_MATCH_TOLERANCE = 0.01

/**
 * Parses a single freeform number token (no ranges) into a numeric value.
 * Supports plain integers/decimals, standalone vulgar fraction glyphs, and
 * mixed numbers formed by an integer immediately followed by a glyph
 * (e.g. "1½"). Returns null if the token can't be parsed as a number.
 */
function parseNumberToken(token: string): number | null {
  const trimmed = token.trim()
  if (trimmed === '') return null

  // Plain integer or decimal, e.g. "2", "1.5"
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Number.parseFloat(trimmed)
  }

  // Standalone fraction glyph, e.g. "½"
  const standaloneGlyphValue = FRACTION_GLYPHS[trimmed]
  if (standaloneGlyphValue !== undefined) {
    return standaloneGlyphValue
  }

  // Mixed number: leading integer immediately followed by a glyph, e.g. "1½"
  const mixedMatch = /^(\d+)([½¼¾⅓⅔])$/.exec(trimmed)
  if (mixedMatch) {
    const [, wholeToken, glyphToken] = mixedMatch
    const whole = Number.parseInt(wholeToken ?? '0', 10)
    const fraction = FRACTION_GLYPHS[glyphToken ?? ''] ?? 0
    return whole + fraction
  }

  return null
}

/**
 * Formats a single scaled numeric value for display:
 * - whole numbers render with no decimal point
 * - values matching a common fraction (within a small tolerance) render
 *   using the fraction glyph, as a mixed number when there's a whole part
 * - anything else falls back to a short decimal (max 2 places, trimmed)
 */
function formatScaledNumber(n: number): string {
  if (Number.isInteger(n)) {
    return String(n)
  }

  const whole = Math.floor(n)
  const fractional = n - whole

  for (const [value, glyph] of GLYPH_BY_VALUE) {
    if (Math.abs(fractional - value) <= FRACTION_MATCH_TOLERANCE) {
      return whole > 0 ? `${whole}${glyph}` : glyph
    }
  }

  // Fallback: short decimal, at most 2 places, trailing zeros trimmed.
  const rounded = Math.round(n * 100) / 100
  return String(rounded)
}

/**
 * Parses `raw`, multiplies any numeric value(s) by `factor`, and re-formats
 * the result. Ranges (e.g. "2-3") scale both ends independently. Text that
 * doesn't parse as a number/range/fraction is returned unchanged.
 */
export function scaleQuantity(raw: string, factor: number): string {
  if (raw === '') return raw

  // Range, e.g. "2-3" (hyphen or en-dash separator).
  const rangeMatch = /^(.+?)\s*([-–])\s*(.+)$/.exec(raw.trim())
  if (rangeMatch) {
    const [, startToken, separator, endToken] = rangeMatch
    if (startToken === undefined || separator === undefined || endToken === undefined) return raw
    const start = parseNumberToken(startToken)
    const end = parseNumberToken(endToken)
    if (start === null || end === null) return raw
    return `${formatScaledNumber(start * factor)}${separator}${formatScaledNumber(end * factor)}`
  }

  const value = parseNumberToken(raw)
  if (value === null) return raw

  return formatScaledNumber(value * factor)
}
