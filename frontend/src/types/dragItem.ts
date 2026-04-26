// frontend/src/types/dragItem.ts
import type { MealSuggestion } from '@/types/mealPlan'
import type { ShortlistEntry } from '@/types/mealPlan'

export type DragItem =
  | { kind: 'suggestion'; suggestion: MealSuggestion }
  | { kind: 'shortlist'; entry: ShortlistEntry }
