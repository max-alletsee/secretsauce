// frontend/src/types/user.ts

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
  created_at: string
  updated_at: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
  display_name?: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
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
}
