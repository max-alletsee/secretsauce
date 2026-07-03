/**
 * moveItem — pure reorder helper.
 *
 * Returns a NEW array with the element at `from` moved to `to`.
 * Never mutates the input array.
 *
 * Returns a shallow copy unchanged when:
 *   - from === to
 *   - from or to is out of bounds (< 0 or >= items.length)
 *
 * Reused in Phase 5 to reindex recipe ingredients/steps.
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const len = items.length
  if (
    from === to ||
    from < 0 ||
    from >= len ||
    to < 0 ||
    to >= len
  ) {
    return [...items]
  }

  const result = [...items]
  // splice always returns an element at a valid index; non-null assertion is safe
  // because we validated bounds above.
  const removed = result.splice(from, 1)[0] as T
  result.splice(to, 0, removed)
  return result
}
