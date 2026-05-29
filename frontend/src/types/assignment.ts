// frontend/src/types/assignment.ts
import type { ShortlistEntry } from '@/types/mealPlan'

export type AssignmentSource =
  | { kind: 'recipe'; recipeId: string; title: string }
  | { kind: 'suggestion'; title: string; matchedRecipeId: string | null }
  | { kind: 'shortlist'; entry: ShortlistEntry }
