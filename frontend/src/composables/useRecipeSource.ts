// frontend/src/composables/useRecipeSource.ts
import type { RecipeSource } from '@/types/recipe'

/**
 * The recipe form exposes the source as a single freeform text field rather
 * than a type toggle plus separate inputs. These helpers are the one place
 * that converts between that string and the backend's structured
 * RecipeSource shape, so the form and the detail view can't drift apart.
 *
 * The source *type* is inferred from the text (see isUrl); `page` is a
 * separate optional input that the form reveals only once the text resolves
 * to a book, since a page number is meaningless for a url source.
 */

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/**
 * Render a RecipeSource as the single-line string shown in the form input.
 * For urls this is the raw url; for books, the title (page is not editable
 * as text — see the module comment).
 */
export function formatRecipeSourceInput(source: RecipeSource | null | undefined): string {
  if (!source) return ''
  if (source.type === 'url') return source.url ?? ''
  return source.book_title ?? ''
}

/**
 * Infer which RecipeSource type a given input string resolves to, or null
 * when it's empty. Exported so the form can decide whether to show the page
 * input without having to build a whole RecipeSource first.
 */
export function detectSourceType(input: string): RecipeSource['type'] | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  return isUrl(trimmed) ? 'url' : 'book'
}

/**
 * Parse the form's inputs back into a RecipeSource.
 *
 * Anything starting with http:// or https:// becomes a url source; any other
 * non-empty text becomes a book source; empty/whitespace becomes null (the
 * user cleared the field).
 *
 * `page` only applies to book sources — it is ignored for urls, so a stale
 * page left over from switching a book to a link can't leak into the payload.
 */
export function parseRecipeSource(
  input: string,
  page?: number | null,
): RecipeSource | null {
  const type = detectSourceType(input)
  if (!type) return null

  const trimmed = input.trim()
  if (type === 'url') {
    return { type: 'url', url: trimmed }
  }

  const source: RecipeSource = { type: 'book', book_title: trimmed }
  if (page != null) source.page = page
  return source
}

/**
 * Human-readable label for the detail view. Urls collapse to their hostname
 * (a full recipe url is long and noisy in an attribution line); books read as
 * "Title, p. 142" when a page is present.
 */
export function formatRecipeSourceLabel(source: RecipeSource | null | undefined): string {
  if (!source) return ''

  if (source.type === 'url') {
    const url = source.url ?? ''
    if (!url) return ''
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      // Not a parseable url despite the type — fall back to the raw value
      // rather than rendering nothing.
      return url
    }
  }

  const title = source.book_title ?? ''
  if (!title) return ''
  return source.page != null ? `${title}, p. ${source.page}` : title
}
