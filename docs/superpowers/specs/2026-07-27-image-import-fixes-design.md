# Image Recipe Import — Upload Limit & Photo Source Picker — Design

**Date:** 2026-07-27
**Status:** Approved design, implementation pending

## Problem

Two defects in recipe import from image, both reported from the installed PWA on a phone.

### 1. Camera photos fail with "Failed to start image import. Please try again."

`nginx/nginx.conf` declares no `client_max_body_size`, so nginx applies its built-in
default of **1 MB**. A full-resolution phone camera photo is typically 2–8 MB, so nginx
rejects the upload with a **413** before it ever proxies to the backend. This directly
contradicts the backend, which is written to accept up to 10 MB
(`_MAX_IMAGE_SIZE` in `app/api/routes/import_tasks.py:76`).

The error text the user sees is the generic fallback rather than a useful message because
nginx's 413 body is HTML, not the backend's JSON error shape. `getApiErrorDetail(err)`
finds no string `detail` field, returns `null`, and `AddRecipeSheet.vue:66` falls through
to `'Failed to start image import. Please try again.'`

This reproduces only through nginx. `npm run dev` proxies via Vite with no such cap, and
the backend integration tests post a tiny fixture JPEG — which is why existing test
coverage passes while the real path fails.

### 2. No way to choose an existing photo

`AddRecipeSheet.vue:120` sets `capture="environment"` on the file input. That attribute
instructs the browser to open the camera directly, which suppresses the OS option to pick
an existing image from the photo library. Users who photographed a cookbook page earlier,
or received a recipe image in a message, cannot import it.

## Decisions

| Question | Decision |
|---|---|
| nginx limit | Add `client_max_body_size 12M;` to the `http` block in `nginx/nginx.conf`. |
| Why 12M and not 10M | Deliberately **above** the app's 10 MB cap so an oversized upload reaches the backend and returns its clean JSON `"File too large (max 10 MB)"`, which the UI can display. A limit equal to or below the app cap would surface nginx's unstyled HTML 413 and reproduce the generic error message. |
| Backend `_MAX_IMAGE_SIZE` | **Unchanged** at 10 MB. It remains the single authoritative limit. |
| Photo source UI | **Two explicit buttons** — "Take photo" and "Choose from library" — backed by two hidden `<input type="file">` elements sharing one change handler. Chosen over relying on the OS chooser because behaviour is then identical across iOS PWA, Android, and desktop. |
| Which input carries `capture` | "Take photo" keeps `capture="environment"`. "Choose from library" omits `capture` entirely. |
| Client-side downscaling | Only when the file **exceeds** the limit. Files at or under the cap upload untouched — no decode, no re-encode, no quality loss on the common case. |
| Downscale trigger threshold | A frontend constant set just under the backend's 10 MB, so a compressed result never lands exactly on the server boundary. |
| Compression strategy | **Iterative**, not a single guess — see rationale below. |
| Compression failure | **Fail open** — return the original file and let the upload proceed. A compression error must not block an import that might otherwise succeed. |

### Why compression must be iterative

A single "resize to N pixels" guess is unreliable, for two reasons:

1. Encoded byte size does not fall predictably with pixel dimensions — it depends heavily
   on image content. A noisy, detailed photo compresses far worse than a flat one.
2. iPhones capture **HEIC**. Safari can decode HEIC, but `canvas.toBlob` re-encodes as
   JPEG, which is a less efficient codec. A HEIC file *under* the limit can therefore
   *grow* past it when converted.

So the implementation re-encodes and checks the actual resulting byte length, stepping
down a fixed ladder until the output fits, with a hard iteration cap.

## New file: `frontend/src/composables/useImageCompression.ts`

A pure async function — no Vue reactivity — so it unit-tests without mounting a
component, matching the existing style of `useScaledQuantity.ts` and `useDateRange.ts`.

```ts
/** Upload ceiling. Just under the backend's 10 MB so a result never lands on the boundary. */
export const MAX_UPLOAD_BYTES = 9 * 1024 * 1024

const QUALITY_LADDER = [0.85, 0.7, 0.55]
const DIMENSION_LADDER = [2048, 1536, 1024]

/**
 * Returns `file` untouched when it already fits within `maxBytes`.
 * Otherwise re-encodes as JPEG, stepping down quality then dimensions until it fits.
 * Returns the original file if decoding or encoding fails (fail open).
 */
export async function compressImageIfNeeded(
  file: File,
  maxBytes: number = MAX_UPLOAD_BYTES,
): Promise<File> { /* ... */ }
```

**Algorithm:**

1. **Fast path.** `if (file.size <= maxBytes) return file` — the untouched original.
2. **Decode.** `createImageBitmap(file)`. Handles JPEG/PNG/WebP, plus HEIC wherever the
   browser supports it, and decodes off the main thread so a 12-megapixel photo does not
   jank the UI.
3. **Iterate.** For each dimension in `DIMENSION_LADDER`, scale the long edge to that
   value (never upscaling), draw to a canvas, and encode via `canvas.toBlob` at each
   quality in `QUALITY_LADDER`. Return the first result whose `blob.size <= maxBytes`.
4. **Return a real `File`**, preserving the original base name with the extension
   rewritten to `.jpg` — the bytes are JPEG now, and the backend's extension allowlist
   (`import_tasks.py:97`) must recognise it.
5. **Fail open.** Wrap steps 2–4 in `try/catch`; on any error return the original `file`.
   Also return the original if the ladder is exhausted without fitting.

## Changes to `frontend/src/components/AddRecipeSheet.vue`

- Replace the single hidden input with two, each with its own ref and testid:
  - `import-image-camera-input` — `accept="image/*"`, `capture="environment"`
  - `import-image-library-input` — `accept="image/*"`, no `capture`
- Replace the single "Import from photo" button with two buttons, "Take photo"
  (`import-image-camera-btn`) and "Choose from library" (`import-image-library-btn`),
  each triggering `.click()` on its corresponding input.
- `handleImageChange` gains one step before upload:

  ```ts
  const upload = await compressImageIfNeeded(file)
  const { data } = await importTasksApi.importRecipeFromImage(upload)
  ```

- Reset the input's `value` after handling, so selecting the same file twice in a row
  still fires a `change` event.
- Both buttons show the existing loading/spinner state while `isImporting` is true.
- Existing error paragraph and `PourLoader` usage are unchanged.

## Changes to `nginx/nginx.conf`

Add to the `http` block, applying to both server blocks:

```nginx
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Recipe image uploads. Deliberately above the backend's 10 MB cap so oversized
    # uploads get the API's JSON error instead of nginx's HTML 413, which the SPA
    # cannot parse into a useful message.
    client_max_body_size 12M;
    ...
}
```

## Testing

**Unit — `frontend/src/composables/useImageCompression.test.ts`** (new).
`createImageBitmap`, `HTMLCanvasElement.prototype.getContext`, and `toBlob` are stubbed,
since jsdom implements none of them:

- A file at or under the limit is returned as the **identical object** (`toBe`), proving
  no re-encode happened on the fast path.
- An oversized file returns a different `File` whose `size` is within the limit.
- The returned filename ends in `.jpg`.
- A `createImageBitmap` rejection returns the original file (fail open).
- A ladder that never fits returns the original file.

**Component — `frontend/src/components/AddRecipeSheet.test.ts`** (extend existing):

- Both buttons render on the photo tab.
- The camera input carries `capture="environment"`; the library input has no `capture`
  attribute.
- Selecting a file on either input calls `importRecipeFromImage` and starts polling.

**Backend.** No backend source changes, so `tests/integration/test_import_routes.py`
stays valid as-is and must continue to pass.

**Manual verification.** The nginx change cannot be covered by unit tests — it requires
the built stack. Verify by posting a >1 MB image through nginx and confirming a 202
rather than a 413.

Run `npm run test:unit`, `npm run type-check`, `npm run lint`, and
`pytest --cov=app --cov-report=term-missing` before considering the work done.

## Out of scope

- Raising or lowering the backend's 10 MB cap.
- Server-side image processing or thumbnailing.
- HEIC decoding on desktop browsers that lack native support — those fail open and upload
  the original, which succeeds under 10 MB and otherwise returns the backend's clean
  error. iOS Safari, the reported PWA case, decodes HEIC natively.
- Multi-image or multi-page recipe import.
- Drag-and-drop upload on desktop.
- Changing the URL-import or manual-entry tabs.
