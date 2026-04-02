# Phase Catch-Up: Scaffolding Fixes, TagFilter, and Phase 3 Completion

**Date:** 2026-04-02
**Scope:** Fix gaps identified in Phase 0/2/3 review; complete remaining Phase 3 work

## Overview

A review of Phases 0-3 against PLAN.md surfaced several gaps: a missing frontend dependency, dual lockfiles, a stale env var in test compose, a missing filter component, and incomplete image import functionality. This spec covers all fixes.

**Explicit non-goals:** Google OAuth button, Fernet token encryption, dedicated `RecipeImportView.vue` / `RecipeImportReview.vue` / `ImportStatusIndicator.vue` pages, backend search/filter queries (Phase 4).

**Plan update:** The import rate limit of 100 requests/hour in `rate_limit.py` is intentional and supersedes the original PLAN.md value of 20/hour.

---

## 1. Frontend Scaffolding Fixes

### 1a. Add vuedraggable

Add `vuedraggable` to `frontend/package.json` production dependencies via pnpm. This is required for Phase 5 (meal plan drag-and-drop) and was expected in the original scaffolding.

### 1b. Remove duplicate lockfile

Delete `frontend/package-lock.json`. The project uses pnpm; only `pnpm-lock.yaml` should exist. Run `pnpm install` after deletion to confirm the lockfile is consistent.

---

## 2. Docker Test Compose Fix

**File:** `docker-compose.test.yml`

Replace the stale environment variable:
- Remove: `OPENROUTER_API_KEY: sk-or-test-placeholder`
- Add: `GEMINI_API_KEY: test-placeholder`

This aligns the test compose with the actual AI provider (Google Gemini via `google-genai` SDK).

---

## 3. TagFilter Component

### Purpose

A filter component for the recipe list view. Visually similar to `TagSelector.vue` (grouped chip buttons) but distinct in purpose: it drives search/filter state rather than editing recipe tags.

### Why a separate component

`TagSelector.vue` uses `defineModel` for two-way binding in `RecipeForm.vue`. The filter use case needs additional affordances (clear-all button, mobile collapsible panel) that would muddy the editing component. Keeping them separate maintains single-responsibility.

### Component: `frontend/src/components/TagFilter.vue`

**Props:**
- `modelValue: string[]` — currently selected filter tags (via `defineModel`)

**Emits:**
- `update:modelValue` — standard v-model emit

**Features:**
- Tag groups matching `TagSelector.vue` categories: Protein, Diet, Season, Meal type, Cuisine
- Toggle chip selection on click (same visual style as `TagSelector.vue`)
- "Clear all" button — visible when any tags are selected, resets selection to `[]`
- **Mobile collapsible:** On screens < 768px, the filter panel is collapsed by default behind a "Filter" toggle button showing a count badge of active filters. Tapping expands/collapses the full tag group panel.
- On desktop (>= 768px), the panel is always expanded (no toggle needed)

### Integration: `RecipeListView.vue`

- Add `TagFilter` between the import section and the recipe grid
- Bind to a local `ref<string[]>` for selected tags
- **No backend wiring in this spec.** The selected tags state is prepared for Phase 4 (search/filter), but for now the filter is purely visual/interactive with no API calls. Phase 4 will add query params to `GET /api/v1/recipes` and wire the store.

---

## 4. Image Import — Backend

### 4a. AI Service: `app/services/ai_service.py`

Add a new function `import_recipe_from_image(image_bytes: bytes, mime_type: str) -> RecipeImportResult`:

- Uses a **separate prompt template** (`_IMAGE_IMPORT_PROMPT_TEMPLATE`) distinct from the URL prompt. The image prompt should guide the model on handling:
  - Photographed cookbook pages
  - Handwritten recipe cards
  - Screenshots of recipe websites
  - Partial or blurry images (request best-effort extraction)
- Passes the image as inline content using `types.Part.from_bytes(data=image_bytes, mime_type=mime_type)`
- No `url_context` tool — just image content + structured output
- Same `RecipeImportResult` response schema as URL import
- Same retry logic (3 attempts, exponential backoff 1s/2s/4s), 60s timeout, logging (model, latency, tokens, success/failure)
- Raises `AIServiceError` on permanent failure

### 4b. Import Task Model: `app/models/import_task.py`

Extend `ImportTask` with:
- `image_path: str | None` — path to the saved temp file in `UPLOAD_DIR`. Nullable (URL imports don't have one).
- The existing `url` field becomes nullable (image imports don't have a URL).

**Migration:** Create an Alembic migration that makes `url` nullable and adds `image_path` column.

### 4c. Import Service: `app/services/recipe_import_service.py`

Add `process_image_import(task_id: UUID, image_path: str, user_id: UUID) -> None`:

- Same structure as `process_url_import`:
  1. Open own `AsyncSession` via `async_session_factory()`
  2. Set task status to `PROCESSING`
  3. Read image bytes from `image_path`, detect MIME type
  4. Call `ai_service.import_recipe_from_image(image_bytes, mime_type)`
  5. Validate: non-empty title, at least 1 ingredient, at least 1 step
  6. Filter tags to `ALL_TAGS`
  7. Create recipe via `recipe_service.create_recipe()` with visibility `private`
  8. Set task to `COMPLETED` with `recipe_id`, or `FAILED` with `error_message`

### 4d. Import Route: `app/api/routes/import_tasks.py`

Add `POST /api/v1/recipes/import/image` to `recipes_router`:

- Accepts `multipart/form-data` with a single `file: UploadFile` field
- Validates file content type is `image/*` (reject non-image uploads)
- Validates file size (max 10 MB)
- Saves uploaded file to `UPLOAD_DIR/{uuid}.{ext}`
- Creates `ImportTask` row with `image_path` set, `url` as `None`
- Fires `process_image_import` as background task
- Returns 202 with `{task_id, status: "pending"}`
- Rate limited via existing `check_import_rate_limit()`

### 4e. Schemas: `app/schemas/import_task.py`

Update `RecipeImportURLRequest` and add any needed schema changes. The `ImportTaskRead` response schema should include the new `image_path` field (or at minimum, an `import_type` indicator so the frontend knows whether this was a URL or image import).

---

## 5. Image Import — Frontend

### 5a. Composable: `frontend/src/composables/useImportPolling.ts`

Extract the polling logic currently in `RecipeListView.vue` into a reusable composable:

```typescript
function useImportPolling() {
  const status: Ref<'idle' | 'pending' | 'processing' | 'completed' | 'failed'>
  const error: Ref<string | null>

  function startPolling(taskId: string): void  // begins 3s interval polling
  function stopPolling(): void                 // clears interval

  return { status, error, startPolling, stopPolling }
}
```

- Accepts an `onComplete(recipeId: string)` callback option for navigation on success
- On `completed`: stops polling, invokes `onComplete`
- On `failed`: stops polling, sets error message
- Uses `onScopeDispose` internally to auto-clean the interval when the calling component unmounts

### 5b. API Function: `frontend/src/api/importTasks.ts`

Add `importRecipeFromImage(file: File)`:
- `POST /api/v1/recipes/import/image` with `FormData` containing the file
- Returns `{ task_id, status }` (same shape as URL import response)

### 5c. Types: `frontend/src/types/importTask.ts`

Update `ImportTask` type if needed to reflect the optional `image_path` / `import_type` field from the backend.

### 5d. UI: `RecipeListView.vue`

Refactor the import section:
- Replace inline polling logic with `useImportPolling()` composable
- Keep the existing URL input bar
- Add a file upload button next to / below the URL input:
  - Styled as a secondary action button ("Upload image" or camera icon)
  - `<input type="file" accept="image/*" capture="environment">` for mobile camera capture
  - Hidden native input, triggered by the styled button
- Both import triggers (URL submit, image upload) feed into the same `useImportPolling` composable
- Shared status/error display for whichever import is active
- Disable both import triggers while an import is in progress

---

## 6. Temp File Cleanup

### Startup cleanup

In `app/main.py` lifespan, on startup:
- Scan `UPLOAD_DIR` for files older than 24 hours
- Delete them
- Log count of deleted files

### Admin endpoint

Add `POST /api/v1/admin/cleanup` to `app/api/routes/admin.py` (or create the file if it doesn't exist):
- Protected with `Depends(current_superuser)`
- Runs the same cleanup logic on demand
- Returns `{"deleted_count": N}`

The cleanup function itself lives in `app/tasks/cleanup.py` and is called from both the lifespan handler and the admin route.

---

## File Change Summary

### New files
- `frontend/src/components/TagFilter.vue`
- `frontend/src/composables/useImportPolling.ts`
- `backend/app/tasks/cleanup.py`
- `backend/alembic/versions/xxxx_add_image_path_to_import_tasks.py` (auto-generated)

### Modified files
- `frontend/package.json` — add `vuedraggable`
- `frontend/pnpm-lock.yaml` — updated by pnpm install
- `docker-compose.test.yml` — `GEMINI_API_KEY` replaces `OPENROUTER_API_KEY`
- `frontend/src/views/RecipeListView.vue` — add TagFilter, image upload, use composable
- `frontend/src/api/importTasks.ts` — add `importRecipeFromImage()`
- `frontend/src/types/importTask.ts` — update types
- `backend/app/services/ai_service.py` — add `import_recipe_from_image()` + `_IMAGE_IMPORT_PROMPT_TEMPLATE`
- `backend/app/models/import_task.py` — add `image_path`, make `url` nullable
- `backend/app/services/recipe_import_service.py` — add `process_image_import()`
- `backend/app/api/routes/import_tasks.py` — add image import endpoint
- `backend/app/schemas/import_task.py` — update for image import
- `backend/app/main.py` — add cleanup to lifespan
- `backend/app/api/routes/admin.py` — add cleanup endpoint (create if needed)

### Deleted files
- `frontend/package-lock.json`
