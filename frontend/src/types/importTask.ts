// frontend/src/types/importTask.ts

export type ImportStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed'

export interface RecipeVersionData {
  id: string
  recipe_id: string
  version_number: number
  title: string
  description: string | null
  ingredients: Array<{ name: string; quantity: string | null; unit: string | null }>
  steps: Array<{ order: number; instruction: string }>
  servings: number
  prep_time_minutes: number | null
  waiting_time_minutes: number | null
  cook_time_minutes: number | null
  tags: string[]
  recipe_source: { type: string; url?: string } | null
  total_time_minutes: number | null
  created_at: string
}

export interface RecipeData {
  id: string
  current_version: RecipeVersionData
}

export interface ImportTask {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  recipe_id: string | null
  error_message: string | null
  import_type: 'url' | 'image' | 'meal_suggestions'
  result_data: { recipe?: RecipeData; suggestions?: unknown[] } | null
  created_at: string
  updated_at: string
}

export interface ImportTaskCreated {
  task_id: string
  status: string
}
