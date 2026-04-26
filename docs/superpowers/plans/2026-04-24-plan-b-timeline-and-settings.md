# Plan B: Rolling Timeline + Profile Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the discrete named meal plan model with a single rolling timeline per user (days as rows, meal types as columns), add profile settings so users can configure which meal types to show, days-ahead, family context and dietary preferences.

**Architecture:** Backend gains a new `/api/v1/timeline/entries` router that owns CRUD for `MealPlanEntry` rows tied directly to the user (not a plan). A DB migration makes `meal_plan_id` nullable and adds `user_id` to `meal_plan_entries`. Frontend replaces `MealPlanDetailView` with `TimelineView`, replaces `useMealPlanStore` with `useTimelineStore`, and adds a `ProfileSettingsView`. The `UserUpdate` schema gains `meal_plan_meal_types` and `meal_plan_days_ahead`.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Vue 3 Composition API, Pinia, Vue Router

---

### Task 1: Extend `UserUpdate` schema to expose meal plan preferences

**Files:**
- Modify: `backend/app/schemas/user.py`
- Modify: `frontend/src/types/user.ts`
- Test: `backend/tests/integration/test_auth_routes.py`

- [ ] **Step 1: Write a failing integration test**

In `backend/tests/integration/test_auth_routes.py`, add:

```python
def test_update_meal_plan_preferences(client, auth_headers):
    """PATCH /api/v1/users/me should accept and persist meal plan preference fields."""
    response = client.patch(
        "/api/v1/users/me",
        json={
            "meal_plan_meal_types": ["breakfast", "dinner"],
            "meal_plan_days_ahead": 10,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["meal_plan_meal_types"] == ["breakfast", "dinner"]
    assert data["meal_plan_days_ahead"] == 10
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd backend && pytest tests/integration/test_auth_routes.py::test_update_meal_plan_preferences -v
```

Expected: FAIL — fields not accepted or not returned.

- [ ] **Step 3: Update `UserUpdate` and `UserRead` schemas**

In `backend/app/schemas/user.py`, update `UserUpdate` and `UserRead`:

```python
class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: str | None
    dietary_restrictions: dict[str, Any]
    allergies: dict[str, Any]
    preferred_units: Literal["metric", "imperial"]
    favorite_cuisines: list[str]
    disliked_ingredients: list[str]
    default_servings: int
    meal_plan_system_prompt: str | None
    meal_plan_meal_types: list[str]
    meal_plan_days_ahead: int
    created_at: datetime
    updated_at: datetime


class UserUpdate(schemas.BaseUserUpdate):
    display_name: str | None = None
    dietary_restrictions: dict[str, Any] | None = None
    allergies: dict[str, Any] | None = None
    preferred_units: Literal["metric", "imperial"] | None = None
    favorite_cuisines: list[str] | None = None
    disliked_ingredients: list[str] | None = None
    default_servings: int | None = None
    meal_plan_system_prompt: str | None = None
    meal_plan_meal_types: list[str] | None = None
    meal_plan_days_ahead: int | None = None
```

- [ ] **Step 4: Run to confirm test passes**

```bash
cd backend && pytest tests/integration/test_auth_routes.py::test_update_meal_plan_preferences -v
```

Expected: PASS

- [ ] **Step 5: Update frontend `User` and `UserUpdatePayload` types**

In `frontend/src/types/user.ts`, add the two new fields:

```typescript
export interface User {
  id: string
  email: string
  display_name: string | null
  is_active: boolean
  is_superuser: boolean
  is_verified: boolean
  dietary_restrictions: Record<string, unknown>
  allergies: Record<string, unknown>
  preferred_units: 'metric' | 'imperial'
  favorite_cuisines: string[]
  disliked_ingredients: string[]
  default_servings: number
  meal_plan_system_prompt: string | null
  meal_plan_meal_types: string[]
  meal_plan_days_ahead: number
  created_at: string
  updated_at: string
}

export interface UserUpdatePayload {
  display_name?: string | null
  dietary_restrictions?: Record<string, unknown>
  allergies?: Record<string, unknown>
  preferred_units?: 'metric' | 'imperial'
  favorite_cuisines?: string[]
  disliked_ingredients?: string[]
  default_servings?: number
  meal_plan_system_prompt?: string | null
  meal_plan_meal_types?: string[]
  meal_plan_days_ahead?: number
}
```

- [ ] **Step 6: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/user.py backend/tests/integration/test_auth_routes.py frontend/src/types/user.ts
git commit -m "feat: expose meal_plan_meal_types and meal_plan_days_ahead in user update/read schemas"
```

---

### Task 2: DB migration — make `meal_plan_id` nullable, add `user_id` to `meal_plan_entries`

**Files:**
- Modify: `backend/app/models/meal_plan.py`
- Create: `backend/alembic/versions/<auto-generated>_timeline_entries_user_id.py`

- [ ] **Step 1: Update the `MealPlanEntry` model**

In `backend/app/models/meal_plan.py`, change `MealPlanEntry.meal_plan_id` to nullable and add `user_id`:

```python
class MealPlanEntry(SQLModel, table=True):
    __tablename__ = "meal_plan_entries"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    meal_plan_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("meal_plans.id", name="fk_meal_plan_entries_plan_id"),
            nullable=True,
            index=True,
        )
    )
    user_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", name="fk_meal_plan_entries_user_id"),
            nullable=True,
            index=True,
        )
    )
    date: _dt.date = Field(sa_column=Column(Date, nullable=False))
    meal_type: str = Field(sa_column=Column(String(20), nullable=False))
    recipe_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("recipes.id", name="fk_meal_plan_entries_recipe_id"),
            nullable=True,
        ),
    )
    note: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    entry_type: str = Field(
        default="recipe",
        sa_column=Column(String(20), nullable=False, server_default="recipe"),
    )
    servings: int = Field(
        default=2,
        sa_column=Column(Integer(), nullable=False, server_default="2"),
    )
    source: str = Field(
        default="manual",
        sa_column=Column(String(20), nullable=False, server_default="manual"),
    )
    position: int = Field(
        default=0,
        sa_column=Column(Integer(), nullable=False, server_default="0"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
```

- [ ] **Step 2: Generate the migration**

```bash
cd backend && alembic revision --autogenerate -m "timeline_entries_user_id"
```

Expected: A new file created in `alembic/versions/`.

- [ ] **Step 3: Review the generated migration**

Open the generated file. Confirm it contains:
- `ALTER TABLE meal_plan_entries ALTER COLUMN meal_plan_id DROP NOT NULL`
- `ALTER TABLE meal_plan_entries ADD COLUMN user_id UUID REFERENCES users(id)`

If Alembic generated extra operations (e.g., dropping the index), review and adjust.

- [ ] **Step 4: Apply the migration**

```bash
alembic upgrade head
```

Expected: Completes without error.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/meal_plan.py backend/alembic/versions/
git commit -m "feat: make meal_plan_id nullable, add user_id to meal_plan_entries for timeline model"
```

---

### Task 3: Backend — `/api/v1/timeline/entries` CRUD router

**Files:**
- Create: `backend/app/api/routes/timeline.py`
- Create: `backend/app/schemas/timeline.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/integration/test_timeline_routes.py`

- [ ] **Step 1: Create the request/response schemas**

Create `backend/app/schemas/timeline.py`:

```python
# backend/app/schemas/timeline.py
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class TimelineEntryCreate(BaseModel):
    date: date
    meal_type: str
    recipe_id: uuid.UUID | None = None
    note: str | None = None
    entry_type: Literal["recipe", "suggestion", "freetext"] = "recipe"
    servings: int = 2
    source: Literal["ai_suggested", "manual", "carryover"] = "manual"
    position: int = 0


class TimelineEntryUpdate(BaseModel):
    recipe_id: uuid.UUID | None = None
    note: str | None = None
    entry_type: Literal["recipe", "suggestion", "freetext"] | None = None
    servings: int | None = None
    position: int | None = None


class TimelineEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None
    meal_plan_id: uuid.UUID | None
    date: date
    meal_type: str
    recipe_id: uuid.UUID | None
    note: str | None
    entry_type: str
    servings: int
    source: str
    position: int
    created_at: datetime


class TimelineEntriesResponse(BaseModel):
    entries: list[TimelineEntryResponse]
```

- [ ] **Step 2: Write failing integration tests**

Create `backend/tests/integration/test_timeline_routes.py`:

```python
import pytest
from datetime import date, timedelta


def test_list_timeline_entries_empty(client, auth_headers):
    today = date.today().isoformat()
    response = client.get(
        f"/api/v1/timeline/entries?from={today}&to={today}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json() == {"entries": []}


def test_create_and_list_timeline_entry(client, auth_headers):
    today = date.today().isoformat()
    create_resp = client.post(
        "/api/v1/timeline/entries",
        json={"date": today, "meal_type": "dinner", "entry_type": "freetext", "note": "Pizza night"},
        headers=auth_headers,
    )
    assert create_resp.status_code == 201
    entry = create_resp.json()
    assert entry["date"] == today
    assert entry["meal_type"] == "dinner"
    assert entry["note"] == "Pizza night"
    assert entry["meal_plan_id"] is None

    list_resp = client.get(
        f"/api/v1/timeline/entries?from={today}&to={today}",
        headers=auth_headers,
    )
    assert list_resp.status_code == 200
    entries = list_resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["id"] == entry["id"]


def test_update_timeline_entry(client, auth_headers):
    today = date.today().isoformat()
    entry = client.post(
        "/api/v1/timeline/entries",
        json={"date": today, "meal_type": "lunch", "entry_type": "freetext", "note": "Salad"},
        headers=auth_headers,
    ).json()

    patch_resp = client.patch(
        f"/api/v1/timeline/entries/{entry['id']}",
        json={"note": "Caesar Salad", "servings": 3},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()
    assert updated["note"] == "Caesar Salad"
    assert updated["servings"] == 3


def test_delete_timeline_entry(client, auth_headers):
    today = date.today().isoformat()
    entry = client.post(
        "/api/v1/timeline/entries",
        json={"date": today, "meal_type": "breakfast", "entry_type": "freetext", "note": "Eggs"},
        headers=auth_headers,
    ).json()

    del_resp = client.delete(
        f"/api/v1/timeline/entries/{entry['id']}",
        headers=auth_headers,
    )
    assert del_resp.status_code == 204

    list_resp = client.get(
        f"/api/v1/timeline/entries?from={today}&to={today}",
        headers=auth_headers,
    )
    assert list_resp.json()["entries"] == []


def test_cannot_access_other_users_entry(client, auth_headers, second_auth_headers):
    today = date.today().isoformat()
    entry = client.post(
        "/api/v1/timeline/entries",
        json={"date": today, "meal_type": "dinner", "entry_type": "freetext", "note": "Mine"},
        headers=auth_headers,
    ).json()

    resp = client.delete(
        f"/api/v1/timeline/entries/{entry['id']}",
        headers=second_auth_headers,
    )
    assert resp.status_code == 404
```

- [ ] **Step 3: Run to confirm tests fail**

```bash
cd backend && pytest tests/integration/test_timeline_routes.py -v
```

Expected: FAIL — router not mounted.

- [ ] **Step 4: Create the timeline router**

Create `backend/app/api/routes/timeline.py`:

```python
# backend/app/api/routes/timeline.py
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import current_active_user
from app.models.meal_plan import MealPlanEntry
from app.models.user import User
from app.schemas.timeline import (
    TimelineEntryCreate,
    TimelineEntryUpdate,
    TimelineEntryResponse,
    TimelineEntriesResponse,
)

router = APIRouter()


@router.get("/entries", response_model=TimelineEntriesResponse)
async def list_timeline_entries(
    from_date: date,
    to_date: date,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> TimelineEntriesResponse:
    result = await db.execute(
        select(MealPlanEntry).where(
            MealPlanEntry.user_id == user.id,
            MealPlanEntry.date >= from_date,
            MealPlanEntry.date <= to_date,
        ).order_by(MealPlanEntry.date, MealPlanEntry.position)
    )
    entries = list(result.scalars().all())
    return TimelineEntriesResponse(
        entries=[TimelineEntryResponse.model_validate(e) for e in entries]
    )


@router.post("/entries", response_model=TimelineEntryResponse, status_code=201)
async def create_timeline_entry(
    data: TimelineEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> TimelineEntryResponse:
    entry = MealPlanEntry(
        user_id=user.id,
        meal_plan_id=None,
        date=data.date,
        meal_type=data.meal_type,
        recipe_id=data.recipe_id,
        note=data.note,
        entry_type=data.entry_type,
        servings=data.servings,
        source=data.source,
        position=data.position,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return TimelineEntryResponse.model_validate(entry)


@router.patch("/entries/{entry_id}", response_model=TimelineEntryResponse)
async def update_timeline_entry(
    entry_id: uuid.UUID,
    data: TimelineEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> TimelineEntryResponse:
    entry = await db.get(MealPlanEntry, entry_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Entry not found")
    if data.recipe_id is not None:
        entry.recipe_id = data.recipe_id
    if data.note is not None:
        entry.note = data.note
    if data.entry_type is not None:
        entry.entry_type = data.entry_type
    if data.servings is not None:
        entry.servings = data.servings
    if data.position is not None:
        entry.position = data.position
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return TimelineEntryResponse.model_validate(entry)


@router.delete("/entries/{entry_id}", status_code=204)
async def delete_timeline_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    entry = await db.get(MealPlanEntry, entry_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.delete(entry)
    await db.commit()
```

- [ ] **Step 5: Mount the router in `main.py`**

In `backend/app/main.py`, add the timeline router. Find the section where routers are included (look for `app.include_router`) and add:

```python
from app.api.routes.timeline import router as timeline_router
app.include_router(timeline_router, prefix="/api/v1/timeline", tags=["timeline"])
```

- [ ] **Step 6: Run integration tests**

```bash
cd backend && pytest tests/integration/test_timeline_routes.py -v
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/routes/timeline.py backend/app/schemas/timeline.py backend/app/main.py backend/tests/integration/test_timeline_routes.py
git commit -m "feat: add /api/v1/timeline/entries CRUD router for rolling timeline model"
```

---

### Task 4: Frontend — `useTimelineStore` and timeline API client

**Files:**
- Create: `frontend/src/api/timeline.ts`
- Create: `frontend/src/types/timeline.ts`
- Create: `frontend/src/stores/useTimelineStore.ts`

- [ ] **Step 1: Create timeline types**

Create `frontend/src/types/timeline.ts`:

```typescript
// frontend/src/types/timeline.ts

export interface TimelineEntry {
  id: string
  user_id: string | null
  meal_plan_id: string | null
  date: string           // YYYY-MM-DD
  meal_type: string
  recipe_id: string | null
  note: string | null
  entry_type: 'recipe' | 'suggestion' | 'freetext'
  servings: number
  source: 'ai_suggested' | 'manual' | 'carryover'
  position: number
  created_at: string
}

export interface TimelineEntryCreate {
  date: string
  meal_type: string
  recipe_id?: string | null
  note?: string | null
  entry_type: 'recipe' | 'suggestion' | 'freetext'
  servings?: number
  source?: 'ai_suggested' | 'manual' | 'carryover'
  position?: number
}

export interface TimelineEntryUpdate {
  recipe_id?: string | null
  note?: string | null
  entry_type?: 'recipe' | 'suggestion' | 'freetext'
  servings?: number
  position?: number
}
```

- [ ] **Step 2: Create timeline API client**

Create `frontend/src/api/timeline.ts`:

```typescript
// frontend/src/api/timeline.ts
import client from './client'
import type { TimelineEntry, TimelineEntryCreate, TimelineEntryUpdate } from '@/types/timeline'

export const listEntries = (fromDate: string, toDate: string) =>
  client.get<{ entries: TimelineEntry[] }>('/timeline/entries', {
    params: { from_date: fromDate, to_date: toDate },
  })

export const createEntry = (data: TimelineEntryCreate) =>
  client.post<TimelineEntry>('/timeline/entries', data)

export const updateEntry = (entryId: string, data: TimelineEntryUpdate) =>
  client.patch<TimelineEntry>(`/timeline/entries/${entryId}`, data)

export const deleteEntry = (entryId: string) =>
  client.delete(`/timeline/entries/${entryId}`)
```

- [ ] **Step 3: Create `useTimelineStore`**

Create `frontend/src/stores/useTimelineStore.ts`:

```typescript
// frontend/src/stores/useTimelineStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as timelineApi from '@/api/timeline'
import type { TimelineEntry, TimelineEntryCreate, TimelineEntryUpdate } from '@/types/timeline'

export const useTimelineStore = defineStore('timeline', () => {
  const entries = ref<TimelineEntry[]>([])
  const loading = ref(false)

  // Keyed lookup: "YYYY-MM-DD|meal_type" → TimelineEntry[]
  const entryMap = computed(() => {
    const map: Record<string, TimelineEntry[]> = {}
    for (const e of entries.value) {
      const key = `${e.date}|${e.meal_type}`
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  })

  function entriesFor(date: string, mealType: string): TimelineEntry[] {
    return entryMap.value[`${date}|${mealType}`] ?? []
  }

  async function fetchEntries(fromDate: string, toDate: string) {
    loading.value = true
    try {
      const { data } = await timelineApi.listEntries(fromDate, toDate)
      entries.value = data.entries
    } finally {
      loading.value = false
    }
  }

  async function prependEntries(fromDate: string, toDate: string) {
    const { data } = await timelineApi.listEntries(fromDate, toDate)
    // Prepend without duplicating
    const existingIds = new Set(entries.value.map((e) => e.id))
    const newEntries = data.entries.filter((e) => !existingIds.has(e.id))
    entries.value = [...newEntries, ...entries.value]
  }

  async function addEntry(data: TimelineEntryCreate): Promise<TimelineEntry> {
    const { data: entry } = await timelineApi.createEntry(data)
    entries.value.push(entry)
    return entry
  }

  async function updateEntry(entryId: string, data: TimelineEntryUpdate): Promise<TimelineEntry> {
    const { data: updated } = await timelineApi.updateEntry(entryId, data)
    const idx = entries.value.findIndex((e) => e.id === entryId)
    if (idx >= 0) entries.value[idx] = updated
    return updated
  }

  async function removeEntry(entryId: string) {
    await timelineApi.deleteEntry(entryId)
    entries.value = entries.value.filter((e) => e.id !== entryId)
  }

  return {
    entries,
    loading,
    entryMap,
    entriesFor,
    fetchEntries,
    prependEntries,
    addEntry,
    updateEntry,
    removeEntry,
  }
})
```

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/timeline.ts frontend/src/api/timeline.ts frontend/src/stores/useTimelineStore.ts
git commit -m "feat: add timeline types, API client, and Pinia store"
```

---

### Task 5: Frontend — `TimelineView` replacing `MealPlanDetailView`

**Files:**
- Create: `frontend/src/views/TimelineView.vue`
- Modify: `frontend/src/components/MealPlanGrid.vue` (repurpose for timeline)
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: Rewrite `MealPlanGrid.vue` to accept flat entries and date range**

Replace the full contents of `frontend/src/components/MealPlanGrid.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import MealSlot from './MealSlot.vue'
import type { TimelineEntry } from '@/types/timeline'

const props = defineProps<{
  fromDate: string       // YYYY-MM-DD
  toDate: string         // YYYY-MM-DD
  mealTypes: string[]    // from user preferences
  entries: TimelineEntry[]
  recipeTitles: Record<string, string>
  todayStr: string       // YYYY-MM-DD — for greying past rows
}>()

const emit = defineEmits<{
  (e: 'save-text', date: string, mealType: string, text: string): void
  (e: 'clear-entry', entryId: string): void
  (e: 'drop-to-slot', item: unknown, date: string, mealType: string): void
}>()

const days = computed(() => {
  const result: string[] = []
  const end = new Date(props.toDate)
  for (let d = new Date(props.fromDate); d <= end; d.setDate(d.getDate() + 1)) {
    result.push(d.toISOString().slice(0, 10))
  }
  return result
})

function isPast(dateStr: string): boolean {
  return dateStr < props.todayStr
}

function entryFor(date: string, mealType: string): TimelineEntry | null {
  return props.entries.find((e) => e.date === date && e.meal_type === mealType) ?? null
}

function recipeTitleFor(entry: TimelineEntry | null): string | undefined {
  if (!entry?.recipe_id) return undefined
  return props.recipeTitles[entry.recipe_id]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}
</script>

<template>
  <div class="plan-grid">
    <!-- Header row -->
    <div class="header-row">
      <div class="day-label-cell"></div>
      <div v-for="mt in mealTypes" :key="mt" class="meal-type-header">
        {{ mt }}
      </div>
    </div>

    <!-- Day rows -->
    <div
      v-for="day in days"
      :key="day"
      class="day-row"
      :class="{ 'day-row--past': isPast(day), 'day-row--today': day === todayStr }"
    >
      <div class="day-label">{{ dayLabel(day) }}</div>
      <MealSlot
        v-for="mealType in mealTypes"
        :key="mealType"
        :entry="entryFor(day, mealType)"
        :meal-type="mealType"
        :recipe-title="recipeTitleFor(entryFor(day, mealType))"
        :disabled="isPast(day)"
        @save-text="(text) => emit('save-text', day, mealType, text)"
        @clear="() => { const e = entryFor(day, mealType); if (e) emit('clear-entry', e.id) }"
      />
    </div>
  </div>
</template>

<style scoped>
.plan-grid {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.header-row {
  display: flex;
  gap: 0.4rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #e5e7eb;
}
.day-label-cell {
  width: 5rem;
  flex-shrink: 0;
}
.meal-type-header {
  flex: 1;
  text-align: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #6b7280;
  letter-spacing: 0.05em;
}
.day-row {
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
}
.day-row--past {
  opacity: 0.4;
  pointer-events: none;
}
.day-row--today .day-label {
  font-weight: 700;
  color: #2563eb;
}
.day-label {
  width: 5rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  color: #6b7280;
}
</style>
```

- [ ] **Step 2: Add `disabled` prop to `MealSlot.vue`**

In `frontend/src/components/MealSlot.vue`, add `disabled` to props and guard the edit/clear actions:

```typescript
const props = defineProps<{
  entry: TimelineEntry | null   // update import from '@/types/timeline'
  mealType: string
  recipeTitle?: string
  disabled?: boolean
}>()
```

Also update the import at the top:
```typescript
import type { TimelineEntry } from '@/types/timeline'
```

In the template, add `:class="{ 'meal-slot--disabled': disabled }"` to the root div, and wrap `@click="startEditing"` in `v-if="!disabled"`.

Add to `<style scoped>`:
```css
.meal-slot--disabled {
  cursor: default;
}
```

- [ ] **Step 3: Create `TimelineView.vue`**

Create `frontend/src/views/TimelineView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useShortlistStore } from '@/stores/useShortlistStore'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useUserStore } from '@/stores/useUserStore'
import { useMealPlanStore } from '@/stores/useMealPlanStore'
import MealPlanGrid from '@/components/MealPlanGrid.vue'
import MealSuggestionPanel from '@/components/MealSuggestionPanel.vue'
import ShortlistPanel from '@/components/ShortlistPanel.vue'

const timelineStore = useTimelineStore()
const shortlistStore = useShortlistStore()
const recipeStore = useRecipeStore()
const userStore = useUserStore()
const planStore = useMealPlanStore()  // still used for AI suggestions
const router = useRouter()

const todayStr = new Date().toISOString().slice(0, 10)

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const fromDate = ref(addDays(todayStr, -2))
const toDate = computed(() =>
  addDays(todayStr, userStore.user?.meal_plan_days_ahead ?? 7)
)

const mealTypes = computed(() => userStore.user?.meal_plan_meal_types ?? ['dinner'])

const recipeTitles = computed(() => {
  const map: Record<string, string> = {}
  for (const recipe of recipeStore.recipes) {
    if (recipe.current_version?.title) {
      map[recipe.id] = recipe.current_version.title
    }
  }
  return map
})

onMounted(async () => {
  await Promise.all([
    timelineStore.fetchEntries(fromDate.value, toDate.value),
    shortlistStore.fetchShortlist(),
    recipeStore.fetchRecipes(),
  ])
})

async function loadEarlier() {
  const newFrom = addDays(fromDate.value, -7)
  await timelineStore.prependEntries(newFrom, addDays(fromDate.value, -1))
  fromDate.value = newFrom
}

async function handleSaveText(date: string, mealType: string, text: string) {
  await timelineStore.addEntry({ date, meal_type: mealType, note: text, entry_type: 'freetext' })
}

async function handleClearEntry(entryId: string) {
  await timelineStore.removeEntry(entryId)
}

async function handleRegenerate(steerPrompt?: string) {
  await planStore.generateSuggestions(steerPrompt, undefined)
}

async function handleRemoveFromShortlist(id: string) {
  await shortlistStore.removeEntry(id)
}
</script>

<template>
  <div class="timeline-view">
    <!-- Top panel: AI suggestions + shortlist -->
    <div class="sources-row">
      <MealSuggestionPanel
        :suggestions="planStore.suggestions"
        :loading="planStore.suggestionLoading"
        @regenerate="handleRegenerate"
      />
      <ShortlistPanel
        :entries="shortlistStore.entries"
        @remove="handleRemoveFromShortlist"
      />
    </div>

    <!-- Rolling grid -->
    <div class="grid-section">
      <div class="grid-header">
        <span class="grid-title">Meal Plan</span>
        <router-link to="/settings" class="settings-link">⚙ Settings</router-link>
      </div>

      <button class="show-earlier-btn" @click="loadEarlier">
        ↑ Show earlier
      </button>

      <MealPlanGrid
        :from-date="fromDate"
        :to-date="toDate"
        :meal-types="mealTypes"
        :entries="timelineStore.entries"
        :recipe-titles="recipeTitles"
        :today-str="todayStr"
        @save-text="handleSaveText"
        @clear-entry="handleClearEntry"
      />
    </div>
  </div>
</template>

<style scoped>
.timeline-view {
  max-width: 1000px;
  margin: 0 auto;
  padding: 1rem;
}
.sources-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}
.sources-row > :first-child {
  flex: 1;
}
.grid-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
}
.grid-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}
.grid-title {
  font-weight: 600;
}
.settings-link {
  font-size: 0.8rem;
  color: #6b7280;
  text-decoration: none;
}
.settings-link:hover { color: #374151; }
.show-earlier-btn {
  display: block;
  width: 100%;
  padding: 0.35rem;
  margin-bottom: 0.5rem;
  background: none;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #9ca3af;
  cursor: pointer;
}
.show-earlier-btn:hover { background: #f3f4f6; color: #6b7280; }
@media (max-width: 767px) {
  .sources-row { flex-direction: column; }
}
</style>
```

- [ ] **Step 4: Update router — replace meal-plan routes with timeline route**

In `frontend/src/router/index.ts`, replace:

```typescript
    {
      path: '/meal-plans',
      name: 'meal-plans',
      component: () => import('@/views/MealPlanListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/meal-plans/new',
      name: 'meal-plan-create',
      component: () => import('@/views/MealPlanCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/meal-plans/:id',
      name: 'meal-plan-detail',
      component: () => import('@/views/MealPlanDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/meal-plans/:id/log',
      name: 'meal-plan-log',
      component: () => import('@/views/MealPlanLogView.vue'),
      meta: { requiresAuth: true },
    },
```

With:

```typescript
    {
      path: '/meal-plan',
      name: 'meal-plan',
      component: () => import('@/views/TimelineView.vue'),
      meta: { requiresAuth: true },
    },
```

- [ ] **Step 5: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors. Fix any type errors arising from the `MealSlot` prop change (`MealPlanEntry` → `TimelineEntry`).

- [ ] **Step 6: Run frontend unit tests**

```bash
cd frontend && npm run test:unit
```

Expected: All pass. Fix any tests referencing old `MealPlan` types in meal plan components.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/TimelineView.vue frontend/src/components/MealPlanGrid.vue frontend/src/components/MealSlot.vue frontend/src/router/index.ts
git commit -m "feat: replace MealPlanDetailView with rolling TimelineView"
```

---

### Task 6: Frontend — Profile Settings page

**Files:**
- Create: `frontend/src/views/ProfileSettingsView.vue`
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: Create `ProfileSettingsView.vue`**

Create `frontend/src/views/ProfileSettingsView.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/stores/useUserStore'

const userStore = useUserStore()

const displayName = ref('')
const dietaryRestrictions = ref<string[]>([])
const allergies = ref<string[]>([])
const favoriteCuisines = ref<string[]>([])
const dislikedIngredients = ref<string[]>([])
const preferredUnits = ref<'metric' | 'imperial'>('metric')
const defaultServings = ref(2)
const mealPlanSystemPrompt = ref('')
const mealPlanMealTypes = ref<string[]>(['dinner'])
const mealPlanDaysAhead = ref(7)

const saving = ref(false)
const saved = ref(false)
const error = ref('')

const ALL_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']

function toggleMealType(mt: string) {
  if (mealPlanMealTypes.value.includes(mt)) {
    mealPlanMealTypes.value = mealPlanMealTypes.value.filter((t) => t !== mt)
  } else {
    mealPlanMealTypes.value = [...mealPlanMealTypes.value, mt]
  }
}

onMounted(() => {
  const u = userStore.user
  if (!u) return
  displayName.value = u.display_name ?? ''
  preferredUnits.value = u.preferred_units
  defaultServings.value = u.default_servings
  mealPlanSystemPrompt.value = u.meal_plan_system_prompt ?? ''
  mealPlanMealTypes.value = u.meal_plan_meal_types ?? ['dinner']
  mealPlanDaysAhead.value = u.meal_plan_days_ahead ?? 7
  // dietary_restrictions and allergies are objects; convert to string arrays for display
  dietaryRestrictions.value = Object.keys(u.dietary_restrictions).filter(
    (k) => u.dietary_restrictions[k],
  )
  allergies.value = Object.keys(u.allergies).filter((k) => u.allergies[k])
  favoriteCuisines.value = [...u.favorite_cuisines]
  dislikedIngredients.value = [...u.disliked_ingredients]
})

async function save() {
  saving.value = true
  saved.value = false
  error.value = ''
  try {
    await userStore.updateProfile({
      display_name: displayName.value || null,
      preferred_units: preferredUnits.value,
      default_servings: defaultServings.value,
      meal_plan_system_prompt: mealPlanSystemPrompt.value || null,
      meal_plan_meal_types: mealPlanMealTypes.value,
      meal_plan_days_ahead: mealPlanDaysAhead.value,
      favorite_cuisines: favoriteCuisines.value,
      disliked_ingredients: dislikedIngredients.value,
    })
    saved.value = true
  } catch {
    error.value = 'Failed to save. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="settings-page">
    <h1>Settings</h1>

    <section class="settings-section">
      <h2>Profile</h2>
      <label class="field-label">
        Display name
        <input v-model="displayName" type="text" class="field-input" placeholder="Your name" />
      </label>
      <label class="field-label">
        Preferred units
        <select v-model="preferredUnits" class="field-input">
          <option value="metric">Metric</option>
          <option value="imperial">Imperial</option>
        </select>
      </label>
      <label class="field-label">
        Default servings
        <input v-model.number="defaultServings" type="number" min="1" max="20" class="field-input" />
      </label>
    </section>

    <section class="settings-section">
      <h2>Meal Planning</h2>

      <div class="field-label">
        Meal types to show
        <div class="chip-row">
          <button
            v-for="mt in ALL_MEAL_TYPES"
            :key="mt"
            type="button"
            class="meal-type-chip"
            :class="{ active: mealPlanMealTypes.includes(mt) }"
            @click="toggleMealType(mt)"
          >
            {{ mt }}
          </button>
        </div>
      </div>

      <label class="field-label">
        Days ahead to plan
        <div class="slider-row">
          <input
            v-model.number="mealPlanDaysAhead"
            type="range"
            min="3"
            max="14"
            class="slider"
          />
          <span class="slider-value">{{ mealPlanDaysAhead }} days</span>
        </div>
      </label>

      <label class="field-label">
        Family context &amp; AI instructions
        <textarea
          v-model="mealPlanSystemPrompt"
          class="field-textarea"
          rows="4"
          placeholder="e.g. 2 adults, 1 toddler. We prefer low-spice meals on weekdays. Sunday is our cooking day."
        />
      </label>
    </section>

    <div class="actions">
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="saved" class="success">Saved!</p>
      <button :disabled="saving" class="save-btn" @click="save">
        {{ saving ? 'Saving…' : 'Save settings' }}
      </button>
    </div>
  </main>
</template>

<style scoped>
.settings-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
}
h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 1.5rem; }
.settings-section { margin-bottom: 2rem; }
h2 { font-size: 1rem; font-weight: 600; margin: 0 0 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
.field-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}
.field-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}
.field-textarea {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  resize: vertical;
}
.chip-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.25rem; }
.meal-type-chip {
  padding: 0.25rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 1rem;
  background: white;
  font-size: 0.8125rem;
  cursor: pointer;
}
.meal-type-chip.active { background: #2563eb; color: white; border-color: #2563eb; }
.slider-row { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.25rem; }
.slider { flex: 1; }
.slider-value { font-size: 0.875rem; color: #6b7280; min-width: 4rem; }
.actions { display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem; }
.save-btn {
  padding: 0.625rem 2rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.error { color: #dc2626; font-size: 0.875rem; }
.success { color: #16a34a; font-size: 0.875rem; }
</style>
```

- [ ] **Step 2: Add the `/settings` route**

In `frontend/src/router/index.ts`, add before the `/admin` route:

```typescript
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/ProfileSettingsView.vue'),
      meta: { requiresAuth: true },
    },
```

- [ ] **Step 3: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/ProfileSettingsView.vue frontend/src/router/index.ts
git commit -m "feat: add ProfileSettingsView with meal planning preferences"
```

---

### Task 7: Run full test suite

- [ ] **Step 1: Backend tests**

```bash
cd backend && pytest --cov=app --cov-report=term-missing
```

Expected: All pass.

- [ ] **Step 2: Frontend tests**

```bash
cd frontend && npm run test:unit
```

Expected: All pass.
