// frontend/src/types/dragItem.ts
import type { MealSuggestion } from '@/types/mealPlan'
import type { ShortlistEntry } from '@/types/mealPlan'
import type { TimelineEntry } from '@/types/timeline'

export type DragItem =
  | { kind: 'suggestion'; suggestion: MealSuggestion }
  | { kind: 'shortlist'; entry: ShortlistEntry }
  | { kind: 'timeline-entry'; entry: TimelineEntry }
