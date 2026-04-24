# MVP Fixes & Redesigns — Design Spec
**Date:** 2026-04-24  
**Status:** Approved for implementation

---

## Overview

Six problem areas identified in the current MVP. Three are bugs with clear root causes; three are intentional redesigns of core UX flows. This spec covers all six.

---

## 1. Recipe Import — Ingredients/Steps/Tags Missing in Wizard

### Problem
When a URL import completes, the frontend redirects immediately to `/recipes/{id}/edit`. `RecipeEditView` fires a fresh `GET /api/v1/recipes/{id}` — this races with the background task's DB session committing. Title and description arrive; ingredients, steps, and tags are missing. Navigating away and back works because the DB write has completed by then.

### Fix
Embed the full recipe data in the import task response. When the background task marks `ImportTask.status = completed`, it already holds the created `Recipe` with its full `RecipeVersion`. Serialize this into `ImportTask.result_data` as a `recipe` key.

The frontend polling composable (`useImportPolling`) currently calls `onComplete(task.recipe_id)` and the view does a second fetch. Change this: `onComplete` receives the full recipe data from `result_data.recipe`. `RecipeEditView` uses this data to pre-populate the form directly — no second API fetch needed.

**Backend changes:**
- `recipe_import_service.py` — after creating the recipe, serialize the full `RecipeVersionRead` schema into `task.result_data = {"recipe": recipe_data}` before setting `status = completed`.
- `ImportTaskRead` schema — add optional `result_data: dict | None` field (already a JSONB column, just needs to be included in the response schema).

**Frontend changes:**
- `useImportPolling.ts` — change `onComplete` callback signature from `(recipeId: string)` to `(recipeId: string, recipeData?: RecipeWithVersion)`. Pass `task.result_data?.recipe` as second argument.
- `RecipeListView.vue` — update callback to pass `recipeData` to the router via state: `router.push({ name: 'recipe-edit', params: { id }, state: { importedRecipe: recipeData } })`.
- `RecipeEditView.vue` — on mount, check `history.state.importedRecipe` first. If present, use it directly to seed the form. Only fetch from API if no state is present (covers direct navigation to the edit URL).

### What stays the same
- Polling interval (3s), error handling, `RecipeForm` component — no changes.

---

## 2. Tags — Hard-coded, No Create/Delete

### Problem
Users expect to be able to create custom tags; the UI does not communicate that tags are selection-only from a fixed list.

### Decision
Keep the 50 pre-built tags as the full tag set for MVP. Custom tag creation is deferred. The list covers all relevant categorisation needs for home cooks.

### Fix (UI only)
- `TagSelector.vue` — add a small label above the tag grid: "Choose from categories". Remove any visual affordance that implies a text input is possible.
- `TagFilter.vue` — no change needed; the filter UI is already clearly a selector.
- No backend changes.

---

## 3. Drag-and-Drop Not Working

### Problem
`MealSuggestionChip` and shortlist entries have `draggable="true"` but no `@dragstart` handler. `MealSlot` has no `@drop` handler. `MealPlanDetailView` emits `convert-to-recipe` but has no handler. The CLAUDE.md spec calls for **vuedraggable** (Sortable.js) — the current stub uses raw HTML5 drag-and-drop with no actual logic.

### Fix
Replace the raw HTML5 stub with `vuedraggable`. The drag payload is a `DragItem` union type:

```typescript
type DragItem =
  | { kind: 'suggestion'; suggestion: MealSuggestion }
  | { kind: 'shortlist'; entry: ShortlistEntry }
```

**Drop behaviour:**  
When a `DragItem` is dropped onto a `MealSlot` (identified by `date` + `meal_type`):
- `kind: 'suggestion'` with `entry_type: 'recipe'` → call `planStore.addEntry({ date, meal_type, recipe_id: suggestion.matched_recipe_id, entry_type: 'recipe' })`
- `kind: 'suggestion'` with `entry_type: 'suggestion'` → call `planStore.addEntry({ date, meal_type, note: suggestion.title, entry_type: 'suggestion' })`
- `kind: 'shortlist'` → call `planStore.addEntry({ date, meal_type, recipe_id: entry.recipe_id, entry_type: 'recipe' })`

**Component changes:**
- `MealSuggestionChip.vue` — add `@dragstart="$emit('dragstart', { kind: 'suggestion', suggestion })"`. Remove `draggable="true"` attribute in favour of vuedraggable wrapper.
- `ShortlistPanel.vue` — same pattern.
- `MealSlot.vue` — become a vuedraggable drop target. Emit `drop-item` with `{ date, meal_type, item: DragItem }` to parent.
- `MealPlanDetailView.vue` — handle `drop-item` by calling the correct `planStore.addEntry()` variant per above.

**Also fix:** Wire the `convert-to-recipe` event (see section 4).

---

## 4. "→ Recipe" Button on AI Suggestions

### Problem
`MealSuggestionChip` emits `convert-to-recipe` with the suggestion title. `MealSuggestionPanel` passes it up. `MealPlanDetailView` has no handler.

### Decision
Option A: AI-powered recipe generation from title. Gemini generates a complete recipe (ingredients, steps, tags) from the suggestion title. Reuses the existing import polling pattern.

### Backend — new endpoint
```
POST /api/v1/recipes/generate
Body: { "title": "Chicken Tikka Masala" }
Response 202: { "task_id": "...", "status": "pending" }
```

Background task (`process_generate_task` in `recipe_import_service.py`):
1. Call `ai_service.generate_recipe_from_title(title)` — a new Gemini call with a prompt instructing it to invent a complete recipe for the given dish name, returning the same structured output as the URL import.
2. Validate (non-empty title, ≥1 ingredient, ≥1 step). Filter tags to `ALL_TAGS`.
3. Create recipe via `recipe_service.create_recipe()`.
4. Set `task.result_data = {"recipe": recipe_data}`, `task.status = completed`.

`ai_service.py` — add `generate_recipe_from_title(title: str) -> RecipeImportResult`. Reuse the same Pydantic response model as URL import.

### Frontend
- `MealPlanDetailView.vue` — add handler for `@convert-to-recipe`:
  ```typescript
  async function handleConvertToRecipe(title: string) {
    const { data } = await recipesApi.generateRecipe(title)
    startPolling(data.task_id)  // reuse useImportPolling
  }
  ```
  On completion: `router.push({ name: 'recipe-edit', params: { id }, state: { importedRecipe: recipeData } })`.
- `api/recipes.ts` — add `generateRecipe(title: string)` function.
- Reuse `useImportPolling` composable — no changes needed there.

---

## 5. Meal Plan → Continuous Rolling Timeline

### Decision
Single rolling timeline per user. No discrete named plans. Days as rows, meal types as columns. Meal types and days-ahead configured in Profile settings (global, not per-plan).

### Data model changes

**Remove:** `MealPlan` as the primary planning container. `MealPlan` is retained in the database for historical `CarryoverMeal` and `RecipeCookLog` references, but is no longer created for new planning activity.

**Effectively, `MealPlanEntry` rows become the primary planning data**, tied directly to the user via a new `user_id` FK (in addition to the existing optional `meal_plan_id` which becomes nullable).

Migration:
```sql
ALTER TABLE meal_plan_entry ADD COLUMN user_id UUID REFERENCES "user"(id);
ALTER TABLE meal_plan_entry ALTER COLUMN meal_plan_id DROP NOT NULL;
```

Existing `MealPlan` rows are not deleted. They remain in the database so `CarryoverMeal` and `RecipeCookLog` FKs stay intact. The UI simply stops creating new `MealPlan` rows for planning purposes. A future migration can clean up orphaned plans once those features are decommissioned.

**New API endpoints:**

```
GET  /api/v1/timeline/entries?from=YYYY-MM-DD&to=YYYY-MM-DD
     → { entries: MealPlanEntry[] }

POST /api/v1/timeline/entries
     Body: { date, meal_type, recipe_id?, note?, entry_type }
     → MealPlanEntry (201)

PATCH /api/v1/timeline/entries/{entry_id}
      Body: { recipe_id?, note?, entry_type?, servings? }
      → MealPlanEntry

DELETE /api/v1/timeline/entries/{entry_id}
       → 204
```

Default fetch window: `from = today - 2 days`, `to = today + meal_plan_days_ahead days`. "Show earlier" fetches an additional 7-day window backward.

**AI suggestions** — `POST /api/v1/meal-plans/suggestions` continues to work. The request body gains optional `from_date` / `to_date` fields (defaulting to today + `meal_plan_days_ahead`). Suggestions are still returned as a list; the user drags them onto specific date+meal_type slots (see section 3).

**User preferences** — `UserUpdate` schema gains `meal_plan_meal_types: list[str] | None` and `meal_plan_days_ahead: int | None`. These are already on the `User` model but were missing from the update schema.

### Frontend changes

**Remove:** `MealPlanCreateView`, `MealPlanListView` (no longer needed — there is one timeline per user).

**Rename/replace:** `MealPlanDetailView` → `TimelineView`. Route: `/meal-plan` (singular, no ID param).

**`TimelineView` behaviour:**
- On mount: fetch entries for `[today - 2, today + meal_plan_days_ahead]`.
- Scroll position anchors to today's row on first load.
- Past rows (before today) rendered with `opacity: 0.4`, checkboxes and edit controls disabled.
- Rows older than 2 days hidden by default. "Show earlier" button at top fetches 7 more days backward and prepends them.
- Columns = `user.meal_plan_meal_types` from the user store.

**`MealPlanGrid.vue`** — update to accept flat `entries: MealPlanEntry[]` + `fromDate`/`toDate` range + `mealTypes: string[]`. No longer derives these from a `MealPlan` object.

**`useMealPlanStore`** → **`useTimelineStore`**. Replaces plan-centric state with entry-centric state keyed by `date+meal_type`.

**Navigation:** Replace the "Meal Plans" nav item (currently links to `/meal-plans`) with "Meal Plan" linking to `/meal-plan`.

**Profile settings page** (`/profile` or `/settings`, new route):  
- Display name
- Dietary restrictions, allergies, favourite cuisines, disliked ingredients
- Preferred units
- **Meal planning section:**
  - Meal types to show (multi-select checkboxes: breakfast, lunch, dinner, snack)
  - Days ahead to plan (slider or number input, 3–14)
  - Family context / AI instructions (textarea → `meal_plan_system_prompt`)
- Calls `PATCH /api/v1/users/me` on save.

---

## 6. Shopping List → Standalone with Meal Checkboard

### Decision
Standalone nav item. User sees a condensed checkboard of the timeline (today + future), ticks days or individual meals, generates a list from the selection.

### Backend changes

**New endpoint:**
```
POST /api/v1/shopping-lists/generate
Body: { "entry_ids": ["uuid1", "uuid2", ...], "name": "Shopping list Apr 25–May 1" }
Response 202: { "task_id": "...", "status": "pending" }
```

Background task: same logic as current `shopping.py` regeneration, but scoped to the provided `entry_ids` rather than a `meal_plan_id`. Fetches those `MealPlanEntry` rows, loads their recipe ingredients, scales by servings, calls Gemini to merge/categorise, writes `ShoppingList` + `ShoppingListItem` rows.

**`ShoppingList` model changes:**
- `meal_plan_id` → nullable (was NOT NULL).
- Add `entry_ids: list[str]` JSONB column (records which entries were selected).
- Add `from_date: date`, `to_date: date` (derived from selected entries, for display).

**Existing endpoints unchanged:** `GET`, `PATCH /items/{id}` still work by `shopping_list_id`.

**New list endpoint:**
```
GET /api/v1/shopping-lists
→ [{ id, name, from_date, to_date, created_at }]  (user's saved lists)
```

### Frontend changes

**New route:** `/shopping-lists` → `ShoppingListsView` (list of saved lists + "New list" button).  
**New route:** `/shopping-lists/new` → `ShoppingListNewView` (checkboard).  
**Existing route:** `/shopping-lists/:id` → `ShoppingListView` (the actual list — unchanged).

**`ShoppingListNewView`:**
- Fetches timeline entries for today + `meal_plan_days_ahead` days.
- Renders the checkboard (condensed table: day rows, meal type columns).
- Past days greyed and disabled.
- Day-level checkbox: checks/unchecks all meals in that day. Indeterminate state if partial.
- "Select all upcoming" button pre-ticks today + all future days.
- Live summary: "N meals · M recipes with ingredients".
- Name input (pre-filled: "Shopping list [from date] – [to date]", updates as selection changes).
- "Generate shopping list →" button → calls `POST /api/v1/shopping-lists/generate` with selected `entry_ids`. Reuses `useImportPolling` composable directly (same polling pattern as recipe import). On completion, redirects to `/shopping-lists/{id}`.

**Navigation:** Add "Shopping" as a top-level nav item linking to `/shopping-lists`. Remove the inline "🛒 Shopping list" button from `TimelineView` (or keep as a shortcut that pre-selects the next 7 days and goes directly to `/shopping-lists/new`).

---

## Out of Scope for This Spec

- OAuth (Google/Apple/Facebook)
- Recipe PDF export
- Unit conversion
- Popularity/recommendation engine
- Carryover meals UI (data model already exists)
- Admin dashboard changes

---

## Implementation Order

The items have dependencies. Recommended sequence:

1. **Recipe import fix** (section 1) — isolated bug fix, no dependencies
2. **Tags UI label** (section 2) — trivial, 5-minute change
3. **User preferences schema** (section 5 partial) — unblock Profile page; extend `UserUpdate` to expose `meal_plan_meal_types` and `meal_plan_days_ahead`
4. **Profile settings page** (section 5 partial) — frontend only once backend schema is done
5. **Timeline backend** (section 5) — DB migration + new `/timeline/entries` endpoints
6. **TimelineView frontend** (section 5) — replace `MealPlanDetailView` + `useMealPlanStore`
7. **Drag-and-drop wiring** (section 3) — requires TimelineView to exist
8. **Recipe generate endpoint** (section 4 backend) — new AI endpoint
9. **"→ recipe" button wiring** (section 4 frontend) — requires generate endpoint
10. **Shopping list generate endpoint** (section 6 backend) — new endpoint + model changes
11. **Shopping list checkboard UI** (section 6 frontend) — new views + routing
