// frontend/src/api/mealPlans.ts
import client from './client'
import type {
  MealPlan,
  MealPlanCreate,
  MealPlanEntry,
  MealPlanEntryCreate,
  MealPlanEntryUpdate,
  MealPlanWithEntries,
  ShortlistEntry,
  ShortlistEntryCreate,
  CarryoverMeal,
  LogEntry,
} from '@/types/mealPlan'
import type { ImportTaskCreated } from '@/types/importTask'

// ── Meal plans ────────────────────────────────────────────────────────────────

export const getMealPlans = () =>
  client.get<MealPlan[]>('/meal-plans')

export const getMealPlan = (id: string) =>
  client.get<MealPlanWithEntries>(`/meal-plans/${id}`)

export const createMealPlan = (data: MealPlanCreate) =>
  client.post<MealPlan>('/meal-plans', data)

export const confirmMealPlan = (id: string) =>
  client.post<MealPlan>(`/meal-plans/${id}/confirm`)

// ── Entries ───────────────────────────────────────────────────────────────────

export const createEntry = (planId: string, data: MealPlanEntryCreate) =>
  client.post<MealPlanEntry>(`/meal-plans/${planId}/entries`, data)

export const updateEntry = (planId: string, entryId: string, data: MealPlanEntryUpdate) =>
  client.patch<MealPlanEntry>(`/meal-plans/${planId}/entries/${entryId}`, data)

export const deleteEntry = (planId: string, entryId: string) =>
  client.delete(`/meal-plans/${planId}/entries/${entryId}`)

// ── Suggestions ───────────────────────────────────────────────────────────────

export const requestSuggestions = (data: { meal_plan_id?: string; steer_prompt?: string }) =>
  client.post<ImportTaskCreated>('/meal-plans/suggestions', data)

// ── Shortlist ─────────────────────────────────────────────────────────────────

export const getShortlist = () =>
  client.get<ShortlistEntry[]>('/meal-plans/shortlist')

export const addToShortlist = (data: ShortlistEntryCreate) =>
  client.post<ShortlistEntry>('/meal-plans/shortlist', data)

export const removeFromShortlist = (id: string) =>
  client.delete(`/meal-plans/shortlist/${id}`)

export const reorderShortlist = (orderedIds: string[]) =>
  client.patch<ShortlistEntry[]>('/meal-plans/shortlist/reorder', { ordered_ids: orderedIds })

// ── Phase 6: Logging ──────────────────────────────────────────────────────────

export const logMealPlan = (planId: string, entries: LogEntry[]) =>
  client.post<CarryoverMeal[]>(`/meal-plans/${planId}/log`, { entries })

export const getCarryovers = () =>
  client.get<CarryoverMeal[]>('/meal-plans/carryovers')
