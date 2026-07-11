// frontend/src/composables/useDateRange.ts

/**
 * Formats two YYYY-MM-DD date strings as a short, human-readable range,
 * e.g. "Jun 21 – Jun 28". Never renders raw ISO strings.
 *
 * The year is included only when the two ends of the range fall in
 * different calendar years (kept off otherwise to stay compact on mobile).
 */
export function formatDateRange(fromDate: string, toDate: string): string {
  const from = new Date(fromDate)
  const to = new Date(toDate)
  const sameYear = from.getFullYear() === to.getFullYear()

  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }

  const fromLabel = from.toLocaleDateString('en-US', opts)
  const toLabel = to.toLocaleDateString('en-US', opts)

  return `${fromLabel} – ${toLabel}`
}
