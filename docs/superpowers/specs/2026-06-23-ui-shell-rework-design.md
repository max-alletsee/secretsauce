# UI Shell & Navigation Rework — Design

**Date:** 2026-06-23
**Status:** Approved (pending spec review)

## Goal

Rework the app shell and several views so the navigation exposes all primary
destinations, the meal-plan timeline serves as a viewable log of past meals, and
the settings page lets users edit the food-preference fields that feed the AI
meal planner. Also remove confirmed dead code.

## Scope

Four independent pieces of work:

1. **Responsive navigation** — add Shopping Lists and Settings to the nav;
   desktop top bar + mobile bottom tab bar.
2. **Editable past days** in the timeline, with grey visual coding.
3. **Food-preference fields** in Settings, with all four user-preference
   collections unified to `list[str]`.
4. **Dead-code removal** of four orphaned meal-plan views.

---

## 1. Responsive Navigation (`App.vue`)

The router already defines `/shopping-lists` and `/settings`; only the nav UI is
missing them.

- **Single source of links** in `App.vue`: Recipes, Meal Plan, Shopping Lists,
  Settings. Admin (superuser-only) and Log out are secondary actions.
- **Desktop (≥768px):** keep the existing horizontal top bar. Primary links on
  the left; Admin + Log out on the right.
- **Mobile (<768px):** a fixed **bottom tab bar** holds the four primary
  destinations (Recipes, Meal Plan, Shopping Lists, Settings). Admin + Log out
  remain in a slim top bar. Active route is highlighted. The page container gets
  `padding-bottom` so content is not hidden behind the bar.
- Remove the now-redundant inline `⚙ Settings` link from the TimelineView grid
  header, since Settings is reachable from the nav.

Presentational change only — no router or store changes.

## 2. Editable Past Days (`MealPlanGrid.vue`, `MealSlot.vue`)

Today the timeline window starts at `today − 2` and "Show earlier" pages further
back, but past rows render at `opacity: 0.4; pointer-events: none` — visible but
unusable.

- `MealPlanGrid.vue`: keep the `day-row--past` class but change its styling from
  heavy opacity + `pointer-events: none` to a **muted grey treatment that stays
  legible and interactive** (grey background/text, no pointer-events block).
- Stop forcing `:disabled="isPast(day)"` on past `MealSlot`s (pass `false` for
  past days). Past slots keep their add / edit / move / remove controls so users
  can log meals retroactively.
- `MealSlot.vue` logic is unchanged. The `disabled` prop stays in its interface
  (still a valid input) but is no longer driven by past-ness.

Net effect: past days look greyed (a clear visual log) yet remain fully editable.

## 3. Food-Preference Fields + Field Consistency

### Consistency decision

All four preference fields are already JSONB columns. The inconsistency is only
in their Pydantic/TypeScript shape: `dietary_restrictions` and `allergies` are
`dict[str, Any]`, while `favorite_cuisines` and `disliked_ingredients` are
`list[str]`. Nothing in the app keys into the dicts — they are flat collections
of strings that get stringified into the AI prompt. The dict shape was
speculative and adds no value.

**Decision:** unify all four to `list[str]`.

### Backend changes

- `models/user.py`: `dietary_restrictions` and `allergies` → `list[str]`,
  `default_factory=list`, `server_default=text("'[]'::jsonb")` (matching
  `favorite_cuisines`).
- `schemas/user.py`: `list[str]` in `UserRead`; `list[str] | None` in
  `UserUpdate` for both fields.
- `ai_service.py`: `_build_suggestions_prompt` — change the
  `dietary_restrictions` / `allergies` params from `dict` to `list[str]` and
  render them with `', '.join(...)` exactly like cuisines. All four fields are
  now formatted identically. Empty-list truthiness keeps the existing
  conditional appends working.
- **Alembic migration:** convert existing JSONB values for the two columns.
  Existing rows hold the `{}` server default, so the data conversion is
  effectively `{}` → `[]`; to be safe, non-empty dicts convert via their keys
  (`{"nuts": true}` → `["nuts"]`). Change the column `server_default` from
  `'{}'::jsonb` to `'[]'::jsonb`. Downgrade wraps arrays back into key-maps.
- Update backend tests that construct/assert these as dicts:
  `test_user_schemas.py`, `test_user_model.py`,
  `test_meal_planner_service.py`, `test_ai_suggestions.py`.

### Frontend changes

- `types/user.ts`: `dietary_restrictions` and `allergies` → `string[]` in both
  `User` and `UserUpdatePayload`.
- `ProfileSettingsView.vue`: add a **"Food preferences"** section with four
  comma-separated text inputs — Dietary restrictions, Allergies, Favorite
  cuisines, Disliked ingredients. Because all four are now `string[]`, a single
  pair of helpers converts between a comma-separated string and a trimmed,
  empty-filtered `string[]`. Parse from `user` on load; serialize on save.

The backend already injects all four fields into the meal-suggestion prompt
(`_build_suggestions_prompt`, called from `meal_suggestion_service`), so no new
injection wiring is required — only the formatting change above.

## 4. Dead-Code Removal

`MealPlanCreateView.vue`, `MealPlanDetailView.vue`, `MealPlanListView.vue`, and
`MealPlanLogView.vue` are not referenced by the router (replaced by
`TimelineView.vue` at `/meal-plan`) and appear only in old plan/spec docs and as
mutual references. They reference routes that no longer exist
(`meal-plan-log`, `shopping-list` with a `mealPlanId` param).

- Delete the four view files.
- Audit and remove now-orphaned dependencies:
  - `MealPlanCard.vue` (used only by `MealPlanListView`).
  - `CarryoverBanner.vue` (used only by `MealPlanLogView`) — confirm no other
    consumer before removal.
  - `useMealPlanStore` methods used only by the deleted views
    (`createPlan`, `fetchPlans`, `fetchPlan`, `confirmPlan`, `addEntry`,
    `removeEntry`) and the `logMealPlan` API function. **Keep**
    `suggestions` / `suggestionLoading` / `generateSuggestions`, which
    `TimelineView` uses.
  - Associated test files for any removed module.
- Remove stale references to the deleted views from `frontend/CLAUDE.md`'s route
  list (update to reflect `/meal-plan` → TimelineView, etc.). Old dated docs
  under `docs/` are historical and left as-is.

## Testing

- **Vitest:** nav renders the correct links and highlights the active route;
  bottom tab bar present on mobile widths. `ProfileSettingsView` round-trips all
  four fields (parse on load, serialize comma-string → `string[]` on save).
  Past days in `MealPlanGrid` render interactive controls (an add button exists
  in a past slot).
- **pytest:** `_build_suggestions_prompt` formats all four list fields
  identically; user model/schema accept `list[str]` for the two migrated fields;
  migration upgrade/downgrade run cleanly.
- Run full `npm run test:unit`, `npm run type-check`, `npm run lint` and backend
  `pytest` before completion.

## Out of Scope

- Surfacing RecipeCookLog (cooked/not-cooked) state in past timeline slots.
- Any change to the meal-suggestion generation flow beyond prompt formatting.
- OAuth, PDF export, and other deferred-from-MVP items.
