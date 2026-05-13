# Meal Plan View Fixes — Design Spec

**Date:** 2026-05-13  
**Status:** Approved

## Overview

Five bugs in the meal plan / recipe frontend, addressed together as a coherent set. Four affect `TimelineView` and its child components; one is a backend FK violation in recipe deletion.

---

## Issue 1 — Drag to Shortlist Not Working

### Root Cause

`ShortlistPanel.vue` renders a `.drop-zone` div with no drag event handlers — it is purely decorative. Additionally, `MealSlot.vue` entries have no `dragstart` handler, so there is no way to drag a placed meal plan entry to the shortlist.

### Fix

**ShortlistPanel becomes a drop target:**
- Add `@dragover.prevent` and `@drop="onDrop"` to the `.drop-zone` div.
- `onDrop` parses the `DragItem` from `dataTransfer` and emits `add-to-shortlist(item: DragItem)`.
- Add visual feedback: `dragOver` ref toggles a `.drop-zone--active` class while dragging over.

**MealSlot becomes a drag source:**
- When the slot has an entry, the content span gets `draggable="true"` and `@dragstart="onDragStart"`.
- `onDragStart` sets `dataTransfer` with a `DragItem` of `kind: 'timeline-entry'` and emits `drag-start` upward.
- `MealPlanGrid` propagates the `drag-start` event to `TimelineView` (pass-through, no logic needed in grid).

**DragItem type extension (`types/dragItem.ts`):**
```typescript
export type DragItem =
  | { kind: 'suggestion'; suggestion: MealSuggestion }
  | { kind: 'shortlist'; entry: ShortlistEntry }
  | { kind: 'timeline-entry'; entry: TimelineEntry }
```

**TimelineView handles `add-to-shortlist`:**
```
kind: 'suggestion', matched_recipe_id set  → entry_type: 'recipe', recipe_id
kind: 'suggestion', no matched_recipe_id   → entry_type: 'suggestion', note: title
kind: 'timeline-entry', recipe_id set      → entry_type: 'recipe', recipe_id
kind: 'timeline-entry', note set           → entry_type: 'suggestion', note
```

---

## Issue 2 — Recipe Links Not Clickable

### Root Cause

`MealSlot.vue` and `MealSuggestionChip.vue` render recipe titles as plain `<span>` elements with no click handlers. No drawer or modal component exists for viewing a recipe without leaving the page.

### Fix

See Issue 3 — the `RecipeDrawer` component built for that issue handles this too.

**MealSlot:** The recipe-type content span gets `@click.stop="emit('open-recipe', entry.recipe_id)"`. This emits up through `MealPlanGrid` to `TimelineView`, which opens the drawer with `recipeId`.

**MealSuggestionChip:** Recipe-type chips (`entry_type === 'recipe'`) get `@click.stop="emit('open-recipe', suggestion.matched_recipe_id)"`. `MealSuggestionPanel` propagates this to `TimelineView`.

**Cursor:** Recipe content spans get `cursor: pointer` styling.

---

## Issue 3 — "→ Recipe" Button Broken

### Root Causes

1. `process_generate_task` immediately calls `recipe_service.create_recipe()`, persisting the recipe before the user reviews it. Cancel in the edit view does not undo this.
2. Steps and tags may be missing in the edit view because the navigation path does not pass full recipe data.
3. No in-flight guard on the "→ recipe" button — multiple rapid clicks spawn multiple tasks and create duplicate recipes.

### Fix

**Backend — `process_generate_task` stops auto-saving:**
- Remove the `recipe_service.create_recipe()` call from `process_generate_task`.
- Store the full AI-generated recipe data in `task.result_data = {"recipe": {...}}` (same shape as today, but no DB recipe created).
- Task completes with `recipe_id = None`.

**Frontend — draft mode in RecipeDrawer:**
- `useImportPolling`'s `onComplete` callback receives `(recipeId, recipeData, resultData)`. When `recipeId` is empty/null but `resultData.recipe` is present, it's a draft.
- `TimelineView` opens `RecipeDrawer` in draft mode, passing `draftRecipe: resultData.recipe`.
- Draft mode shows a "Draft — not yet saved" banner, "Save to my recipes" button, and "Dismiss" button.
- "Save to my recipes" calls `recipeStore.createRecipe(draftRecipe)`, then closes the drawer.
- "Dismiss" closes the drawer — nothing is saved.

**In-flight guard:**
- `convertingTitle = ref<string | null>(null)` tracks which title is being converted.
- `handleConvertToRecipe` is a no-op if `convertingTitle.value !== null`.
- Reset on task completion or error.
- Chip shows a spinner / disabled state while its title is converting.

---

## Issue 4a — No "Show Later" Button

### Root Cause

`toDate` in `TimelineView` is a `computed` value fixed at `addDays(todayStr, daysAhead)` with no mechanism to extend it forward.

### Fix

**`TimelineView`:**
- Convert `toDate` from `computed` to `ref`, initialized to `addDays(todayStr, userStore.user?.meal_plan_days_ahead ?? 7)`.
- Add `loadLater()`:
  ```typescript
  async function loadLater() {
    const newTo = addDays(toDate.value, 7)
    await timelineStore.appendEntries(toDate.value, newTo)
    toDate.value = newTo
  }
  ```
- Add "↓ Show later" button below the grid, styled identically to "↑ Show earlier".

**`useTimelineStore`:**
- Add `appendEntries(from: string, to: string)` that fetches the range and appends to `entries`, deduplicating by `id` (mirrors existing `prependEntries`).

---

## Issue 4b — Recipe Deletion Fails with FK Error

### Root Cause

`delete_recipe` nullifies `Recipe.current_version_id` and deletes `RecipeVersion` rows, but `TimelineEntry.recipe_id` and `MealPlanEntry.recipe_id` foreign keys block the final `DELETE` on the `Recipe` row. PostgreSQL raises an FK violation.

### Fix

**In `recipe_service.delete_recipe`, before deleting versions:**
1. Capture the recipe title from the current version (for use as fallback note).
2. Set `recipe_id = NULL`, `entry_type = 'freetext'`, `note = <recipe title>` on all `TimelineEntry` (i.e. `MealPlanEntry`) rows referencing this recipe — `recipe_id` and `note` are both nullable on that model.
3. Set `recipe_id = NULL` on all `ShortlistEntry` rows referencing this recipe — `recipe_id` is nullable.
4. Delete all `RecipeCookLog` rows referencing this recipe — `recipe_id` is NOT NULL there, so nullification is not possible; deletion is the correct semantic.
5. Delete all `CarryoverMeal` rows referencing this recipe — same reason.
6. Then proceed with existing nullify-versions → delete-versions → delete-recipe sequence.

All steps happen in the same transaction. Meal plan slots that referenced the deleted recipe remain as freetext notes rather than disappearing. Cook logs and carryover entries are deleted outright.

---

## New Component: RecipeDrawer.vue

### Props

```typescript
defineProps<{
  recipeId?: string         // existing recipe — fetched from store
  draftRecipe?: RecipeVersion  // generated draft — data already in memory
}>()
defineEmits<{
  (e: 'close'): void
  (e: 'saved', recipe: Recipe): void  // emitted after draft is saved
}>()
```

Exactly one of `recipeId` or `draftRecipe` must be provided. The component guards against neither/both being set.

### Layout

- **Desktop:** fixed right-side drawer, 420px wide, full viewport height, `position: fixed`, `z-index: 200`, slide-in transition.
- **Mobile (≤767px):** bottom sheet, full width, up to 85vh, slide-up transition.
- **Backdrop:** semi-transparent overlay behind the drawer; clicking it closes the drawer.
- **Close button:** × in top-right corner.

### Content

Same structure as `RecipeDetailView`:
- Title, description, meta row (servings, time)
- Ingredients list
- Steps list
- Tags

**`recipeId` mode:** fetches directly via `recipesApi.getRecipe(recipeId)` into a local `recipe` ref (not via `recipeStore.fetchRecipe`, which would overwrite `currentRecipe` globally and break any open recipe edit). Shows "Edit" router-link for owners.

**`draftRecipe` mode:** renders from prop data immediately (no fetch). Shows:
- Yellow "Draft — not yet saved" banner at top
- "Save to my recipes" button (calls `createRecipe`, emits `saved`, closes)
- "Dismiss" button (calls `close`)
- No "Edit" link

### State in TimelineView

```typescript
const drawerOpen = ref(false)
const drawerRecipeId = ref<string | null>(null)
const drawerDraftRecipe = ref<RecipeVersion | null>(null)

function openRecipeDrawer(recipeId: string) {
  drawerDraftRecipe.value = null
  drawerRecipeId.value = recipeId
  drawerOpen.value = true
}

function openDraftDrawer(draftRecipe: RecipeVersion) {
  drawerRecipeId.value = null
  drawerDraftRecipe.value = draftRecipe
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  drawerRecipeId.value = null
  drawerDraftRecipe.value = null
}
```

---

## Files Changed

### Backend
- `backend/app/services/recipe_service.py` — `delete_recipe`: nullify MealPlanEntry + ShortlistEntry FKs, delete RecipeCookLog + CarryoverMeal rows, before deleting versions
- `backend/app/services/recipe_import_service.py` — `process_generate_task`: remove `create_recipe` call, store result in `result_data` only

### Frontend
- `frontend/src/types/dragItem.ts` — add `timeline-entry` variant
- `frontend/src/components/ShortlistPanel.vue` — add drop zone event handlers + visual feedback
- `frontend/src/components/MealSlot.vue` — add dragstart on entry content + open-recipe emit
- `frontend/src/components/MealPlanGrid.vue` — propagate `drag-start` and `open-recipe` events
- `frontend/src/components/MealSuggestionChip.vue` — add open-recipe emit for recipe-type chips + in-flight state
- `frontend/src/components/MealSuggestionPanel.vue` — propagate `open-recipe` event
- `frontend/src/components/RecipeDrawer.vue` — new component
- `frontend/src/stores/useTimelineStore.ts` — add `appendEntries` method
- `frontend/src/views/TimelineView.vue` — drawer state, `toDate` as ref, `loadLater`, event handlers

---

## Out of Scope

- `MealPlanDetailView` (non-timeline meal plans): recipe linking and shortlist drag could be added there later with the same pattern; excluded from this spec to keep scope tight.
- Shopping list impact of recipe deletion: orphaned shopping list items with deleted recipe references are not addressed here.
