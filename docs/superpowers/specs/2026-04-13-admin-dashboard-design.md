# Admin Dashboard — Design Spec

**Date:** 2026-04-13
**Status:** Approved

## Overview

A superuser-only admin dashboard covering user management and log access. Accessible at `/admin` (redirects to `/admin/users`). Protected by `requiresSuperuser: true` on all routes — non-superusers are redirected to `/recipes`.

The dashboard is desktop-primary but must not break on mobile. It is an internal tool for a small number of trusted administrators.

---

## Layout

Sidebar navigation (Option B from brainstorming). A persistent left sidebar contains links to all sections. The active section is highlighted with a left border accent. The sidebar also contains a "Run Cleanup" button at the bottom that triggers the existing upload cleanup task.

### Routes

| Path | View | Description |
|---|---|---|
| `/admin` | — | Redirects to `/admin/users` |
| `/admin/users` | `AdminUsersView.vue` | User management table |
| `/admin/logs/app` | `AdminAppLogsView.vue` | Structured request log viewer |
| `/admin/logs/ai` | `AdminAiLogsView.vue` | AI call log table |
| `/admin/logs/audit` | `AdminAuditLogView.vue` | Admin action audit trail |

All routes carry `meta: { requiresAuth: true, requiresSuperuser: true }`.

`AdminLayout.vue` is the shared wrapper component that renders the sidebar and a `<router-view>` for the active section.

---

## Section 1: User Management (`/admin/users`)

### Layout

A full-width searchable table. Toolbar above the table contains:
- Free-text search field (matches email or display name)
- Status filter dropdown: All / Active / Inactive
- Role filter dropdown: All / User / Superuser

### Table columns

| Column | Notes |
|---|---|
| Email / Name | Email as primary, display name as secondary in smaller text |
| Status | "● Active" (green) or "○ Inactive" (muted red) |
| Role | "Superuser" (amber) or "User" (grey) |
| Joined | Date only (`YYYY-MM-DD`) |
| Expand | "▼ expand" / "▲ collapse" toggle |

Inactive users are rendered at reduced opacity.

### Expandable row

Clicking a row's expand toggle opens an inline panel below that row. Only one row can be expanded at a time — expanding another row collapses the current one.

The panel shows:
- Recipe count, meal plan count, last active date — loaded lazily on first expand via `GET /admin/users/{id}/stats`
- A loading spinner while stats are fetching
- Action buttons: **Promote to superuser** / **Demote from superuser** (toggled based on current role), **Activate** / **Deactivate** (toggled based on current status), **Delete account…**

### Delete confirmation

"Delete account…" does not delete immediately. On click:
1. Button text changes to "Confirm delete? (5)" and becomes disabled
2. A 5-second countdown runs
3. Button becomes active as "Confirm delete" — clicking now sends the DELETE request
4. If the user clicks elsewhere or collapses the row, the countdown resets

### Pagination

Cursor-based, consistent with the rest of the app. Displays "Showing X of Y users" with prev/next controls.

---

## Section 2: App Logs (`/admin/logs/app`)

### Data source

A new Starlette middleware (`app/core/logging.py`) writes one JSON line per HTTP request to a log file. The file path is configured via the `APP_LOG_FILE` environment variable, defaulting to `/var/log/secretsauce/app.log`.

Each log line contains:
```json
{
  "timestamp": "2026-04-13T09:14:31Z",
  "level": "INFO",
  "method": "POST",
  "path": "/api/v1/recipes/import/url",
  "status_code": 202,
  "latency_ms": 8,
  "user_id": "uuid-or-null"
}
```

`level` is derived from `status_code`: `ERROR` for 5xx, `WARN` for 4xx, `INFO` for everything else. Unhandled exceptions caught by the middleware are logged as `ERROR` with an `error` field.

### View

The backend reads the log file, applies filters, and returns the last N matching lines. The view renders them as a table with columns: Time, Level, Path, Status, Latency.

**Filters:**
- Level: All / INFO / WARN / ERROR
- User: `AdminUserPicker` component — search by email, selected user appears as a dismissible chip. Clears to show all users.
- Line count: Last 50 / 100 / 500 (default 100)
- Refresh button (manual — no auto-polling)

Level badges are color-coded: INFO green, WARN amber, ERROR red.

---

## Section 3: AI Logs (`/admin/logs/ai`)

### Data source

A new `AICallLog` database table. `ai_service.py` writes one row after every Gemini API call, success or failure.

### Table columns

Time, Type (call_type), Model, Input tokens, Output tokens, Latency (or error label if failed).

**Filters:**
- Type: All / url-import / image-import / meal-plan
- Status: All / Success / Failed
- Date range: Last 24h / 7 days / 30 days (default 7 days)
- User: `AdminUserPicker` — same component as App Logs

Cursor-based pagination.

---

## Section 4: Audit Log (`/admin/logs/audit`)

### Data source

A new `AdminAuditLog` database table. Written by admin route handlers when a user management action is taken. Strictly append-only — no update or delete endpoints exist for this table.

### Table columns

Time, Action (color-coded badge), Description (human-readable sentence, e.g. "Promoted bob@example.com to superuser"), By (admin email).

**Action badge colors:**
- PROMOTE — blue
- DEMOTE — blue
- ACTIVATE — green
- DEACTIVATE — amber
- DELETE — red
- CLEANUP — grey (includes `deleted_count` in details)

**Filters:**
- Action: All / specific action type
- Date range: Last 7 days / 30 days / All time (default 30 days)

Cursor-based pagination. No user filter — the log is about admin actions, not end-user activity.

---

## Sidebar: Run Cleanup

A button at the bottom of the sidebar that calls `POST /admin/cleanup`. On click:
- Button is replaced with a spinner
- On success: shows "Deleted N files" for 3 seconds, then resets
- On error: shows error message for 3 seconds, then resets
- Always writes an `AdminAuditLog` entry with `action=CLEANUP` and `details: {deleted_count: N}`

---

## Data Models

### AICallLog

```python
class AICallLog(SQLModel, table=True):
    __tablename__ = "ai_call_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id", nullable=True)
    call_type: str  # "url_import" | "image_import" | "meal_plan"
    model: str
    prompt_summary: str  # first 200 chars of prompt
    latency_ms: int
    input_tokens: int
    output_tokens: int
    success: bool
    error_message: str | None = Field(default=None)
    created_at: datetime
```

### AdminAuditLog

```python
class AdminAuditLog(SQLModel, table=True):
    __tablename__ = "admin_audit_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    admin_id: uuid.UUID = Field(foreign_key="users.id")
    action: str  # "PROMOTE" | "DEMOTE" | "ACTIVATE" | "DEACTIVATE" | "DELETE" | "CLEANUP"
    target_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id", nullable=True)
    details: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=text("'{}'::jsonb")),
    )
    created_at: datetime
```

---

## Backend Routes

All in `backend/app/api/routes/admin.py`. Mounted at `/api/v1/admin` in `main.py`. All require `Depends(current_superuser)`. Business logic in `backend/app/services/admin.py`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/admin/users` | Paginated user list. Query params: `search`, `status` (active\|inactive), `role` (user\|superuser), `cursor`, `limit` (default 20). |
| PATCH | `/api/v1/admin/users/{id}` | Update `is_active` or `is_superuser`. Writes audit log. |
| DELETE | `/api/v1/admin/users/{id}` | Hard delete user. Writes audit log. |
| GET | `/api/v1/admin/users/{id}/stats` | Returns `recipe_count`, `meal_plan_count`, `last_active`. |
| GET | `/api/v1/admin/logs/app` | Read and filter `app.log`. Query params: `level`, `user_id`, `limit` (default 100). |
| GET | `/api/v1/admin/logs/ai` | Paginated `AICallLog`. Query params: `call_type`, `success`, `user_id`, `since` (ISO date), `cursor`. |
| GET | `/api/v1/admin/logs/audit` | Paginated `AdminAuditLog`. Query params: `action`, `since`, `cursor`. |
| POST | `/api/v1/admin/cleanup` | Existing. Updated to write audit log entry. |

---

## Frontend Structure

```
frontend/src/
├── views/admin/
│   ├── AdminUsersView.vue
│   ├── AdminAppLogsView.vue
│   ├── AdminAiLogsView.vue
│   └── AdminAuditLogView.vue
├── components/admin/
│   ├── AdminLayout.vue          # sidebar wrapper + <router-view>
│   ├── AdminUserRow.vue         # expandable row with lazy stats + actions
│   ├── AdminUserPicker.vue      # email search → user chip (shared by app + AI log views)
│   └── LogFilterBar.vue         # shared filter bar component
├── stores/
│   ├── useAdminUsersStore.ts    # user list, pagination, stats cache, actions
│   └── useAdminLogsStore.ts     # app/AI/audit log state + filters
└── api/
    └── admin.ts                 # typed API functions for all admin endpoints
```

---

## Schemas

New file: `backend/app/schemas/admin.py`

- `AdminUserResponse` — user fields safe to expose to admins (all except `hashed_password`)
- `AdminUserUpdate` — `is_active: bool | None`, `is_superuser: bool | None`
- `UserStatsResponse` — `recipe_count: int`, `meal_plan_count: int`, `last_active: datetime | None` (max `created_at` across the user's recipes and meal plans; null if they have neither)
- `AICallLogResponse` — mirrors `AICallLog` model
- `AdminAuditLogResponse` — mirrors `AdminAuditLog` model with `admin_email` and `target_email` joined in
- `AppLogEntry` — `timestamp`, `level`, `method`, `path`, `status_code`, `latency_ms`, `user_id`

---

## New Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_LOG_FILE` | `/var/log/secretsauce/app.log` | Path to structured JSON request log file |

---

## Out of Scope

- Editing user profile fields (dietary restrictions, cuisines, etc.) from the admin view
- Real-time log streaming (no WebSocket — manual refresh only)
- Soft-delete / user anonymisation (hard delete only for MVP)
- Exporting logs as CSV
