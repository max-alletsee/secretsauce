// frontend/src/types/recipe.ts

export interface Ingredient {
  name: string
  // Stored as a freeform string (e.g. "1½", "2-3"). Phase 7 shopping list
  // aggregation will need to parse/normalize this for summing quantities.
  quantity: string
  unit: string | null
}

export interface Step {
  order: number
  instruction: string
}

export interface RecipeSource {
  type: 'url' | 'book'
  url?: string
  book_title?: string
  page?: number
}

export interface RecipeVersion {
  id: string
  recipe_id: string
  version_number: number
  title: string
  description: string | null
  ingredients: Ingredient[]
  steps: Step[]
  servings: number
  prep_time_minutes: number | null
  waiting_time_minutes: number | null
  cook_time_minutes: number | null
  total_time_minutes: number | null
  tags: string[]
  recipe_source: RecipeSource | null
  created_at: string
}

export interface Recipe {
  id: string
  owner_id: string
  visibility: 'private' | 'shared'
  current_version: RecipeVersion
  created_at: string
  updated_at: string
}

export interface RecipeCreatePayload {
  title: string
  description?: string | null
  ingredients: Ingredient[]
  steps: Step[]
  servings?: number
  prep_time_minutes?: number | null
  waiting_time_minutes?: number | null
  cook_time_minutes?: number | null
  tags?: string[]
  recipe_source?: RecipeSource | null
  visibility?: 'private' | 'shared'
}

export interface RecipeUpdatePayload {
  title?: string
  description?: string | null
  ingredients?: Ingredient[]
  steps?: Step[]
  servings?: number
  prep_time_minutes?: number | null
  waiting_time_minutes?: number | null
  cook_time_minutes?: number | null
  tags?: string[]
  recipe_source?: RecipeSource | null
  visibility?: 'private' | 'shared'
}
