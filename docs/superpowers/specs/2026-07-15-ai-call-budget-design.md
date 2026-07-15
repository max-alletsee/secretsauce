# AI Call Budget for New Users — Design

**Date:** 2026-07-15
**Status:** Approved design, implementation pending

## Problem

Any registered user can trigger Gemini calls (recipe import, recipe generation, meal
suggestions, shopping lists) with no per-user spending guard. A new account could run up
unbounded API costs. We want new users to start in a capped "onboarding mode" and give
admins a way to lift the cap per user.

## Decisions

| Question | Decision |
|---|---|
| Spend metric | Call count, not USD. New users get **300 AI calls**. |
| Existing users | Grandfathered as **unlimited** (budget = NULL) at migration time. |
| Admin actions | Both **remove** (→ unlimited) and **restore** (→ default 300). |
| Admin visibility | Admin UI shows calls used and budget state per user. |
| User visibility | None. Users only ever see an "onboarding mode" error message when capped. |
| Failed AI calls | **Count against the budget** — retries and malformed responses still consume tokens; this is a spend guard. |

## Backend

### Schema

- Alembic migration: add `ai_call_budget INTEGER NULL` to `users`. Nullable, **no server
  default, no backfill** — every existing row stays NULL (unlimited).
- `app/models/user.py`: `ai_call_budget: int | None` with a Python-side
  `default_factory` reading `settings.AI_CALL_BUDGET_DEFAULT`, so every user created
  through fastapi-users registration gets the default budget without touching
  `UserManager`.

### Config

- New optional setting in `app/core/config.py`: `AI_CALL_BUDGET_DEFAULT: int = 300`.

### Enforcement

New service `app/services/ai_budget.py`:

- `count_ai_calls(db, user_id) -> int` — `SELECT count(*) FROM ai_call_logs WHERE
  user_id = :user_id` (column already indexed). All rows count, including
  `success = false`.
- `ensure_ai_budget(db, user) -> None` — no-op when `user.ai_call_budget` is NULL;
  otherwise raises when `count_ai_calls(...) >= user.ai_call_budget`:

  ```
  HTTPException(status_code=403, detail="Onboarding mode — AI features are temporarily limited. Contact the administrator to continue.")
  ```

Guard call added at the top of all six AI-triggering routes, after the existing
rate-limit check where one exists:

| Route | File |
|---|---|
| `POST /api/v1/recipes/import/url` | `api/routes/import_tasks.py` |
| `POST /api/v1/recipes/import/image` | `api/routes/import_tasks.py` |
| `POST /api/v1/recipes/generate` | `api/routes/import_tasks.py` |
| `POST /api/v1/meal-plans/suggestions` | `api/routes/meal_plans.py` |
| `POST /api/v1/shopping-lists/generate` | `api/routes/shopping_lists.py` |
| `POST /api/v1/shopping-lists/{meal_plan_id}/regenerate` | `api/routes/shopping_lists.py` |

Checking at the route (not inside background tasks) gives the user an immediate 403
instead of a task that fails later.

**Accepted looseness:** logs are written by background tasks after the request-time
check, so parallel requests can overshoot the cap by a few calls. Acceptable for a
guardrail.

### Bug fix folded in

The two shopping-list AI calls (`app/services/shopping.py` — `regenerate_shopping_list`
and `generate_shopping_list_from_entries`) call `ai_service.call_ai_structured` without
`call_type`, `user_id`, or `db`, so that spend is never logged. Both call sites will pass
`call_type="shopping_list"`, the owning `user_id`, and the session so their calls are
attributed. Without this the budget under-counts.

### Admin API

- `AdminUserUpdate` gains `ai_budget_mode: Literal["unlimited", "default"] | None = None`.
  - `"unlimited"` → `ai_call_budget = NULL`, audit action `BUDGET_REMOVE`.
  - `"default"` → `ai_call_budget = settings.AI_CALL_BUDGET_DEFAULT`, audit action
    `BUDGET_RESTORE`. (Restore always resets to the current default, even if a custom
    value was hand-set in the DB.)
  - Both audit entries include `{"email": ...}` details, matching the existing pattern
    in `admin_service.update_user`. No audit entry / no write when the value would not
    change.
- `AdminUserResponse` gains `ai_call_budget: int | None`.
- `UserStatsResponse` gains `ai_calls_used: int` (count query added to
  `admin_service.get_user_stats`).
- `_format_audit_description` gains cases: `BUDGET_REMOVE` → "Removed AI budget for
  {email}", `BUDGET_RESTORE` → "Restored AI budget for {email}".
- **`schemas/user.py` is untouched** — the budget is never exposed to non-admin users.

## Frontend

- `types/admin.ts`: `AdminUser.ai_call_budget: number | null`,
  `UserStats.ai_calls_used: number`, `AdminUserUpdate.ai_budget_mode?: 'unlimited' | 'default'`.
- `AdminUserRow.vue` expanded panel:
  - Stats line shows `AI calls: {used} / {budget}` when budgeted, `AI calls: {used} ·
    unlimited` when not.
  - New action button: "Remove AI budget" when a budget is set, "Restore AI budget"
    when unlimited. Emits the existing `update` event with `{ ai_budget_mode: ... }`;
    store and API client need no structural changes.
- User-facing: **no new UI.** The flows that trigger AI calls (recipe import modal,
  meal-plan suggestions, shopping-list generate/regenerate) must display the backend
  `detail` string when a 403 comes back. Each flow's error path is verified during
  implementation and patched only if it swallows the message.

## Error handling

- Plain string `detail` on the 403, consistent with the rest of the codebase (no
  error-code envelope).
- Superusers with a budget set are subject to the same check; in practice an admin
  would remove their budget.

## Testing (TDD)

Written test-first, in this order:

1. **Unit — `ai_budget` service:** NULL budget always passes; used < budget passes;
   used == budget raises 403; used > budget raises 403; failed calls included in count.
2. **Integration — routes:** each of the six routes returns 403 with the onboarding
   message for an exhausted user and succeeds (202/200) for budgeted-under and
   unlimited users; registration creates users with `ai_call_budget = 300`.
3. **Integration — admin:** PATCH with `ai_budget_mode="unlimited"` nulls the budget
   and writes a `BUDGET_REMOVE` audit row; `"default"` restores 300 with
   `BUDGET_RESTORE`; no-op when unchanged; stats response includes `ai_calls_used`;
   user list response includes `ai_call_budget`.
4. **Integration — shopping attribution:** shopping-list generation writes
   `ai_call_logs` rows with the user's id and `call_type="shopping_list"` (mocked AI).
5. **Frontend unit — `AdminUserRow`:** renders both budget states; emits `update` with
   the correct `ai_budget_mode` payload.
6. Existing suites stay green: `pytest --cov=app`, `npm run test:unit`.

## Out of scope

- USD/token-based cost accounting (call count chosen deliberately).
- User-visible budget display or warnings before exhaustion.
- Per-user custom budget amounts in the admin UI (DB column supports it; UI only does
  remove/restore).
- Rate limiting changes (existing import rate limit stays as is).
- E2E Playwright coverage for the admin budget flow (manual verification instead).
