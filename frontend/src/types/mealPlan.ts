// frontend/src/types/mealPlan.ts

export interface MealPlan {
  id: string
  user_id: string
  name: string
  start_date: string
  end_date: string
  status: 'draft' | 'active' | 'completed'
  created_at: string
  updated_at: string
}

export interface MealPlanEntry {
  id: string
  meal_plan_id: string
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  recipe_id: string | null
  note: string | null
  entry_type: 'recipe' | 'suggestion' | 'freetext'
  servings: number
  source: 'ai_suggested' | 'manual' | 'carryover'
  position: number
  created_at: string
}

export interface MealPlanWithEntries extends MealPlan {
  entries: MealPlanEntry[]
}

export interface MealPlanCreate {
  name: string
  start_date: string
  end_date: string
}

export interface MealPlanEntryCreate {
  date: string
  meal_type: string
  recipe_id?: string | null
  note?: string | null
  entry_type: 'recipe' | 'suggestion' | 'freetext'
  servings?: number
  source?: 'ai_suggested' | 'manual' | 'carryover'
  position?: number
}

export interface MealPlanEntryUpdate {
  recipe_id?: string | null
  note?: string | null
  entry_type?: 'recipe' | 'suggestion' | 'freetext'
  servings?: number
  position?: number
}

export interface ShortlistEntry {
  id: string
  user_id: string
  recipe_id: string | null
  note: string | null
  entry_type: 'recipe' | 'suggestion'
  position: number
  created_at: string
}

export interface ShortlistEntryCreate {
  recipe_id?: string | null
  note?: string | null
  entry_type: 'recipe' | 'suggestion'
}

export interface MealSuggestion {
  title: string
  matched_recipe_id: string | null
  entry_type: 'recipe' | 'suggestion'
}

export interface CarryoverMeal {
  id: string
  recipe_id: string
  original_date: string
  original_meal_type: string
  reason: 'not_cooked' | 'leftover'
  resolved: boolean
  created_at: string
}

export interface LogEntry {
  entry_id: string
  outcome: 'cooked' | 'not_cooked' | 'leftover'
}
