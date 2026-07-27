# Image Import Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix camera-photo recipe import failing with "Failed to start image import" and let users choose between taking a new photo and picking an existing one.

**Architecture:** Three independent changes. (1) nginx gains a `client_max_body_size` so uploads over 1 MB are no longer rejected with a 413 before reaching the backend — this is the actual bug. (2) A new pure-async frontend composable re-encodes images only when they exceed the upload cap, iterating down a quality/dimension ladder because encoded size does not fall predictably with dimensions. (3) The Add-recipe sheet gets two buttons — "Take photo" and "Choose from library" — backed by two hidden file inputs that differ only in the `capture` attribute.

**Tech Stack:** Vue 3 Composition API (`<script setup>`, TypeScript), Vitest + jsdom + `@vue/test-utils`, nginx.

**Design spec:** `docs/superpowers/specs/2026-07-27-image-import-fixes-design.md`

## Global Constraints

- Backend `_MAX_IMAGE_SIZE` stays **10 MB** (`backend/app/api/routes/import_tasks.py:76`). Do not change it. No backend source changes at all in this plan.
- nginx limit is **12M** — deliberately *above* the app's 10 MB so oversized uploads return the backend's JSON `detail` error instead of nginx's unparseable HTML 413.
- Frontend `MAX_UPLOAD_BYTES` is **9 MB** — deliberately *below* the backend cap so a compressed result never lands on the server boundary.
- Compression must **fail open**: any decode/encode error returns the original `File` rather than throwing.
- Files at or under the cap must be returned as the **identical object** — no decode, no re-encode, no quality loss.
- Vue 3 Composition API with `<script setup>` and `scoped` styles only. Never Options API.
- Existing test file `frontend/src/components/AddRecipeSheet.test.ts` already references testids `import-image-btn` and `import-image-input` in four tests. Task 3 renames those elements, so those tests must be updated in the same task or the suite breaks.
- Run `npm run test:unit`, `npm run type-check`, and `npm run lint` from `frontend/` before considering frontend work done.

---

### Task 1: nginx upload limit (the actual bug fix)

This task alone fixes the reported error. It is deliberately first and standalone so it can ship independently of the frontend work.

**Files:**
- Modify: `nginx/nginx.conf:5-7` (the `http` block, immediately after `default_type`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks. Tasks 2 and 3 are independent of this one.

- [ ] **Step 1: Add the directive**

In `nginx/nginx.conf`, inside the `http { }` block, directly below the `default_type` line, add:

```nginx
    # Recipe image uploads. Deliberately above the backend's 10 MB cap
    # (_MAX_IMAGE_SIZE in app/api/routes/import_tasks.py) so an oversized upload
    # reaches the API and gets its JSON error, instead of nginx's HTML 413 which
    # the SPA cannot parse into a useful message. Without this, nginx defaults to
    # 1 MB and rejects ordinary phone camera photos.
    client_max_body_size 12M;
```

Placing it in `http` (not inside a `server` or `location`) means it applies to both the port-80 and port-443 server blocks.

- [ ] **Step 2: Verify the config parses**

Run: `podman run --rm -v "$(pwd)/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:alpine nginx -t`

Expected: `syntax is ok` and `test is successful`.

If podman is unavailable, skip this step — Step 3 covers it.

- [ ] **Step 3: Verify against the running stack**

This change cannot be covered by a unit test; it requires the built stack.

```bash
podman-compose -f docker-compose.test.yml up -d --build
```

Create a >1 MB test image and post it through nginx (not directly to the backend port — the whole point is to exercise the proxy):

```bash
head -c 2000000 /dev/urandom > /tmp/big.jpg
curl -k -s -o /dev/null -w "%{http_code}\n" -X POST https://localhost/api/v1/recipes/import/image -F "file=@/tmp/big.jpg;type=image/jpeg"
```

Expected: **401** (unauthenticated — the request reached the backend's auth layer, proving nginx passed it through).
Before this fix the same command returns **413**.

A 401 here is success. Getting 413 means the directive did not take effect — confirm the container picked up the edited file.

- [ ] **Step 4: Commit**

```bash
git add nginx/nginx.conf
git commit -m "fix: raise nginx client_max_body_size so camera photos can upload

nginx defaulted to 1 MB and rejected phone camera photos with a 413
before they reached the backend, which accepts up to 10 MB. The SPA
could not parse nginx's HTML error body, so the user saw the generic
'Failed to start image import' message."
```

---

### Task 2: `useImageCompression` composable

A pure async function with no Vue reactivity, matching the style of `useScaledQuantity.ts`. Written test-first.

**Files:**
- Create: `frontend/src/composables/useImageCompression.ts`
- Test: `frontend/src/composables/useImageCompression.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces — Task 3 imports exactly these two symbols:
  - `MAX_UPLOAD_BYTES: number` — the 9 MB constant.
  - `compressImageIfNeeded(file: File, maxBytes?: number): Promise<File>` — `maxBytes` defaults to `MAX_UPLOAD_BYTES`.

**Background for the implementer:** jsdom implements neither `createImageBitmap` nor canvas rendering, so the tests stub both on `globalThis` / `HTMLCanvasElement.prototype`. `File` extends `Blob`, and `file.size` is derived from its contents, so a test "oversized" file is built by allocating a real byte array of the required length.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/composables/useImageCompression.test.ts`:

```ts
// frontend/src/composables/useImageCompression.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { compressImageIfNeeded, MAX_UPLOAD_BYTES } from './useImageCompression'

/** Build a File of an exact byte length. */
function fileOfSize(bytes: number, name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

/**
 * Stub the canvas/bitmap APIs jsdom lacks.
 * `encodedSizes` yields the byte size each successive toBlob call should produce,
 * letting a test drive the ladder to a chosen outcome.
 */
function stubImagePipeline(encodedSizes: number[]) {
  const toBlob = vi.fn((cb: (b: Blob | null) => void) => {
    const size = encodedSizes.shift() ?? 1_000
    cb(new Blob([new Uint8Array(size)], { type: 'image/jpeg' }))
  })
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4032, height: 3024, close: vi.fn() })),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    toBlob as unknown as HTMLCanvasElement['toBlob'],
  )
  return { toBlob }
}

describe('compressImageIfNeeded', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns the identical file object when it is already under the limit', async () => {
    const file = fileOfSize(1024)
    const createImageBitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', createImageBitmap)

    const result = await compressImageIfNeeded(file, MAX_UPLOAD_BYTES)

    // Identity check: proves no decode/re-encode happened on the fast path.
    expect(result).toBe(file)
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('returns the identical file object when it is exactly at the limit', async () => {
    const file = fileOfSize(2048)
    const result = await compressImageIfNeeded(file, 2048)
    expect(result).toBe(file)
  })

  it('compresses an oversized file down to within the limit', async () => {
    stubImagePipeline([500])
    const file = fileOfSize(4096)

    const result = await compressImageIfNeeded(file, 1024)

    expect(result).not.toBe(file)
    expect(result.size).toBeLessThanOrEqual(1024)
  })

  it('names the compressed output .jpg so the backend extension allowlist accepts it', async () => {
    stubImagePipeline([500])
    const file = fileOfSize(4096, 'IMG_1234.HEIC', 'image/heic')

    const result = await compressImageIfNeeded(file, 1024)

    expect(result.name).toBe('IMG_1234.jpg')
    expect(result.type).toBe('image/jpeg')
  })

  it('steps down the ladder until the encoded result fits', async () => {
    // First two encodes are still too big; the third fits.
    const { toBlob } = stubImagePipeline([5000, 3000, 800])
    const file = fileOfSize(9999)

    const result = await compressImageIfNeeded(file, 1024)

    expect(toBlob).toHaveBeenCalledTimes(3)
    expect(result.size).toBeLessThanOrEqual(1024)
  })

  it('returns the original file when decoding fails (fail open)', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('unsupported format')
      }),
    )
    const file = fileOfSize(4096, 'IMG_1234.HEIC', 'image/heic')

    const result = await compressImageIfNeeded(file, 1024)

    expect(result).toBe(file)
  })

  it('returns the original file when the ladder never produces a small enough result', async () => {
    // Every encode stays over the limit.
    stubImagePipeline(Array(20).fill(9_000))
    const file = fileOfSize(9999)

    const result = await compressImageIfNeeded(file, 1024)

    expect(result).toBe(file)
  })

  it('exports a limit below the backend 10 MB cap', () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(10 * 1024 * 1024)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/composables/useImageCompression.test.ts`

Expected: FAIL — the module does not exist yet ("Failed to resolve import ./useImageCompression").

- [ ] **Step 3: Write the implementation**

Create `frontend/src/composables/useImageCompression.ts`:

```ts
// frontend/src/composables/useImageCompression.ts

/**
 * Upload ceiling for recipe images, in bytes.
 *
 * Deliberately below the backend's 10 MB `_MAX_IMAGE_SIZE`
 * (app/api/routes/import_tasks.py) so a compressed result never lands exactly on
 * the server's boundary. nginx allows 12M, above both, so oversized uploads get
 * the API's JSON error rather than nginx's HTML 413.
 */
export const MAX_UPLOAD_BYTES = 9 * 1024 * 1024

/**
 * Re-encode quality steps, tried in order at each dimension.
 * Lower quality is preferred over lower resolution: keeping pixels legible
 * matters more to the AI extracting recipe text than absolute fidelity does.
 */
const QUALITY_LADDER = [0.85, 0.7, 0.55]

/** Long-edge pixel budgets, tried in order once the quality ladder is exhausted. */
const DIMENSION_LADDER = [2048, 1536, 1024]

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality))
}

/** Swap any extension for .jpg — the compressed bytes are always JPEG. */
function toJpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '')
  return `${base || 'photo'}.jpg`
}

/**
 * Shrink `file` only if it exceeds `maxBytes`.
 *
 * A file already within the limit is returned untouched — same object, no decode,
 * no re-encode, no quality loss. That is the common case (library photos,
 * screenshots) and the fast path here keeps it lossless.
 *
 * Oversized files are re-encoded as JPEG, stepping down the quality ladder and
 * then the dimension ladder, checking the real encoded byte length each time.
 * A single fixed guess is not enough: encoded size does not fall predictably with
 * pixel dimensions, and HEIC input re-encoded to JPEG can even grow.
 *
 * Fails open — if the browser cannot decode or encode the image (e.g. HEIC on a
 * desktop browser), the original file is returned and the upload proceeds. A
 * compression failure must not block an import that might otherwise succeed.
 */
export async function compressImageIfNeeded(
  file: File,
  maxBytes: number = MAX_UPLOAD_BYTES,
): Promise<File> {
  if (file.size <= maxBytes) return file

  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    try {
      for (const maxEdge of DIMENSION_LADDER) {
        // Never upscale a photo that is already smaller than the budget.
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
        canvas.width = Math.round(bitmap.width * scale)
        canvas.height = Math.round(bitmap.height * scale)
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

        for (const quality of QUALITY_LADDER) {
          const blob = await encode(canvas, quality)
          if (blob && blob.size <= maxBytes) {
            return new File([blob], toJpegName(file.name), {
              type: 'image/jpeg',
              lastModified: Date.now(),
            })
          }
        }
      }
    } finally {
      bitmap.close?.()
    }

    // Ladder exhausted — hand back the original and let the server decide.
    return file
  } catch {
    return file
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/composables/useImageCompression.test.ts`

Expected: PASS — 8 tests.

- [ ] **Step 5: Type-check and lint**

Run: `cd frontend && npm run type-check && npm run lint`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/composables/useImageCompression.ts frontend/src/composables/useImageCompression.test.ts
git commit -m "feat: add useImageCompression composable

Re-encodes oversized recipe photos only when they exceed the upload cap,
iterating a quality then dimension ladder because encoded size does not
fall predictably with dimensions and HEIC re-encoded to JPEG can grow.
Fails open so a compression error never blocks an upload."
```

---

### Task 3: Two-button photo source picker

Renames the single photo control into a camera/library pair and wires in compression. Four existing tests reference the old testids and are updated here.

**Files:**
- Modify: `frontend/src/components/AddRecipeSheet.vue` — script (lines 26-27, 56-68), template (lines 112-147), styles
- Modify: `frontend/src/components/AddRecipeSheet.test.ts` — update 4 existing tests, add 4 new ones

**Interfaces:**
- Consumes from Task 2: `compressImageIfNeeded(file, maxBytes?)` and `MAX_UPLOAD_BYTES` from `@/composables/useImageCompression`.
- Produces: testids `import-image-camera-btn`, `import-image-library-btn`, `import-image-camera-input`, `import-image-library-input`. The old `import-image-btn` / `import-image-input` no longer exist.

**Background for the implementer:** `capture="environment"` tells the browser to open the rear camera directly, which suppresses the OS "choose existing photo" option. Omitting the attribute gives the normal file picker. Two inputs is the only way to offer both reliably across iOS, Android, and desktop. The sheet's content is `Teleport`ed to `document.body`, so tests query `document.body`, not the wrapper.

- [ ] **Step 1: Update the existing tests and write the new failing tests**

In `frontend/src/components/AddRecipeSheet.test.ts`, first add the compression mock alongside the existing `vi.mock` calls near the top of the file (after the `@/api/importTasks` mock, before the imports at line 20):

```ts
// Compression is exercised in useImageCompression.test.ts; here it passes files through.
vi.mock('@/composables/useImageCompression', () => ({
  MAX_UPLOAD_BYTES: 9 * 1024 * 1024,
  compressImageIfNeeded: vi.fn(async (file: File) => file),
}))
```

and add to the import block below it:

```ts
import { compressImageIfNeeded } from '@/composables/useImageCompression'
```

Then update the **four existing tests** that use the removed testids:

- `'shows an image upload button'` — replace the single `import-image-btn` assertion with both new buttons:

```ts
  it('shows both take-photo and choose-from-library buttons', async () => {
    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    qsAll('[role="tab"]')[1]!.click()
    await flushPromises()
    expect(document.body.querySelector('[data-testid="import-image-camera-btn"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="import-image-library-btn"]')).toBeTruthy()
    wrapper.unmount()
  })
```

- `'switches panels when the photo tab is selected'` — change `import-image-btn` to `import-image-camera-btn`.
- `'disables image button and shows spinner while importing image'` — change the input selector to `import-image-camera-input` and the button selector to `import-image-camera-btn`.
- `'navigates to edit view when image task completes'` — change the input selector to `import-image-camera-input`.

Then add these **four new tests** inside the same `describe` block:

```ts
  it('sets capture on the camera input but not the library input', async () => {
    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    qsAll('[role="tab"]')[1]!.click()
    await flushPromises()

    const camera = qs<HTMLInputElement>('[data-testid="import-image-camera-input"]')
    const library = qs<HTMLInputElement>('[data-testid="import-image-library-input"]')

    // capture="environment" opens the camera directly; its absence lets the OS
    // show the photo library.
    expect(camera.getAttribute('capture')).toBe('environment')
    expect(library.hasAttribute('capture')).toBe(false)
    expect(library.getAttribute('accept')).toBe('image/*')
    wrapper.unmount()
  })

  it('uploads a file chosen from the library', async () => {
    vi.mocked(importTasksApi.importRecipeFromImage).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-lib-1', status: 'pending' }),
    )

    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    qsAll('[role="tab"]')[1]!.click()
    await flushPromises()

    const input = qs<HTMLInputElement>('[data-testid="import-image-library-input"]')
    const file = new File([new Uint8Array(32)], 'saved.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(importTasksApi.importRecipeFromImage).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('compresses the file before uploading it', async () => {
    vi.mocked(importTasksApi.importRecipeFromImage).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-img-3', status: 'pending' }),
    )

    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    qsAll('[role="tab"]')[1]!.click()
    await flushPromises()

    const input = qs<HTMLInputElement>('[data-testid="import-image-camera-input"]')
    const file = new File([new Uint8Array(32)], 'recipe.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(compressImageIfNeeded).toHaveBeenCalledWith(file)
    wrapper.unmount()
  })

  it('disables both photo buttons while importing', async () => {
    vi.mocked(importTasksApi.importRecipeFromImage).mockResolvedValueOnce(
      axiosOk<ImportTaskCreated>({ task_id: 'task-img-4', status: 'pending' }),
    )

    const wrapper = mount(AddRecipeSheet, { attachTo: document.body })
    qsAll('[role="tab"]')[1]!.click()
    await flushPromises()

    const input = qs<HTMLInputElement>('[data-testid="import-image-camera-input"]')
    const file = new File([new Uint8Array(32)], 'recipe.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(qs<HTMLButtonElement>('[data-testid="import-image-camera-btn"]').disabled).toBe(true)
    expect(qs<HTMLButtonElement>('[data-testid="import-image-library-btn"]').disabled).toBe(true)
    wrapper.unmount()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/AddRecipeSheet.test.ts`

Expected: FAIL — the new testids do not exist, so the `qs()` helper throws "Selector not found: [data-testid="import-image-camera-input"]".

- [ ] **Step 3: Update the component script**

In `frontend/src/components/AddRecipeSheet.vue`, add the import next to the existing ones (near line 12):

```ts
import { compressImageIfNeeded } from '@/composables/useImageCompression'
```

Replace the single ref on line 27:

```ts
const imageInputRef = ref<HTMLInputElement | null>(null)
```

with two:

```ts
const cameraInputRef = ref<HTMLInputElement | null>(null)
const libraryInputRef = ref<HTMLInputElement | null>(null)
```

Replace `handleImageChange` (lines 56-68) with:

```ts
async function handleImageChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset so picking the same file twice in a row still fires a change event.
  input.value = ''
  if (!file || isImporting.value) return
  importError.value = null
  importStatus.value = 'pending'
  try {
    const upload = await compressImageIfNeeded(file)
    const { data } = await importTasksApi.importRecipeFromImage(upload)
    startPolling(data.task_id)
  } catch (err) {
    importStatus.value = 'failed'
    importError.value = getApiErrorDetail(err) ?? 'Failed to start image import. Please try again.'
  }
}
```

- [ ] **Step 4: Update the component template**

Replace the photo panel's `add-recipe-sheet__image-row` div (lines 113-142) with:

```vue
      <div class="add-recipe-sheet__image-row">
        <!-- Two inputs, not one: capture="environment" opens the camera directly,
             which suppresses the OS option to pick an existing photo. Omitting it
             gives the normal library picker. -->
        <input
          ref="cameraInputRef"
          data-testid="import-image-camera-input"
          type="file"
          accept="image/*"
          capture="environment"
          class="add-recipe-sheet__image-input"
          :disabled="isImporting"
          @change="handleImageChange"
        />
        <input
          ref="libraryInputRef"
          data-testid="import-image-library-input"
          type="file"
          accept="image/*"
          class="add-recipe-sheet__image-input"
          :disabled="isImporting"
          @change="handleImageChange"
        />

        <button
          data-testid="import-image-camera-btn"
          type="button"
          :disabled="isImporting"
          class="add-recipe-sheet__image-btn"
          @click="cameraInputRef?.click()"
        >
          <span v-if="isImporting" class="add-recipe-sheet__btn-loading">
            <span data-testid="import-spinner" aria-hidden="true">
              <PourLoader size="sm" label="Importing" />
            </span>
            Importing…
          </span>
          <span v-else class="add-recipe-sheet__btn-loading">
            <BaseIcon :icon="Camera" /> Take photo
          </span>
        </button>

        <button
          data-testid="import-image-library-btn"
          type="button"
          :disabled="isImporting"
          class="add-recipe-sheet__image-btn"
          @click="libraryInputRef?.click()"
        >
          <span class="add-recipe-sheet__btn-loading">
            <BaseIcon :icon="ImageIcon" /> Choose from library
          </span>
        </button>
      </div>
```

Update the icon import on line 11 to bring in a second icon, aliased because `Image` collides with the DOM global:

```ts
import { Camera, Image as ImageIcon } from '@lucide/vue'
```

- [ ] **Step 5: Update the styles**

The row now stacks two full-width buttons instead of holding one. Replace the `.add-recipe-sheet__image-row` rule (lines 215-218) with:

```css
.add-recipe-sheet__image-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
```

And make the buttons fill the row and centre their contents — add to the existing `.add-recipe-sheet__image-btn` rule (line 222):

```css
.add-recipe-sheet__image-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-2);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
}
```

The `var(--space-3)` vertical padding gives a comfortable touch target on the 375px-wide phone screens this app targets.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/AddRecipeSheet.test.ts`

Expected: PASS — all tests in the file, including the 4 updated and 4 new ones.

- [ ] **Step 7: Run the full frontend suite, type-check, and lint**

Run: `cd frontend && npm run test:unit && npm run type-check && npm run lint`

Expected: all pass. Nothing outside `AddRecipeSheet` referenced the renamed testids, so no other suite should be affected — if one is, fix that reference rather than reverting the rename.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/AddRecipeSheet.vue frontend/src/components/AddRecipeSheet.test.ts
git commit -m "feat: let users take a photo or choose an existing one

capture=\"environment\" forced the camera and hid the photo library, so a
recipe photo taken earlier could not be imported. Split into two inputs
behind two buttons, and compress oversized photos before upload."
```

---

### Task 4: End-to-end verification

The unit tests stub the browser image APIs and never touch nginx, so the real path — a genuine multi-megabyte photo through the proxy — still needs one manual pass.

**Files:** none modified.

**Interfaces:**
- Consumes: the deployed result of Tasks 1-3.
- Produces: nothing.

- [ ] **Step 1: Build and start the test stack**

```bash
podman-compose -f docker-compose.test.yml up -d --build
```

- [ ] **Step 2: Verify a large upload passes the proxy**

```bash
head -c 3000000 /dev/urandom > /tmp/big.jpg
curl -k -s -o /dev/null -w "%{http_code}\n" -X POST https://localhost/api/v1/recipes/import/image -F "file=@/tmp/big.jpg;type=image/jpeg"
```

Expected: **401**, not 413 — the request reached the backend's auth layer.

- [ ] **Step 3: Verify both buttons in a browser**

Open the app, sign in, tap "Add recipe" → "From photo". Confirm:
- Both "Take photo" and "Choose from library" render and are comfortably tappable at 375px width.
- "Choose from library" opens the file/photo picker, **not** the camera.
- Selecting an image starts the import (spinner appears, both buttons disable).

- [ ] **Step 4: Verify on the phone PWA — the originally reported case**

On the installed PWA, use "Take photo" and shoot a real full-resolution photo of a recipe.

Expected: the import starts and completes, instead of failing with "Failed to start image import. Please try again."

Also confirm "Choose from library" can import a photo saved earlier.

- [ ] **Step 5: Report results**

Report the actual observed outcome of each check above, including any that failed. Do not mark this task complete on the basis of the unit tests alone — Steps 2 and 4 are the only checks that exercise the real bug.

---

## Notes for the implementer

- **Task 1 is the actual fix.** Tasks 2 and 3 are the requested feature plus a safeguard. If time is short, Task 1 shipped alone resolves the reported error.
- Tasks 1 and 2 are fully independent and can be done in either order. Task 3 depends on Task 2's exports. Task 4 requires all three.
- Do not "helpfully" raise the backend's 10 MB cap or align the three limits to one number — they differ deliberately, and the ordering (9 MB client < 10 MB app < 12M nginx) is what produces a readable error message instead of a generic one.
