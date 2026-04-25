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
