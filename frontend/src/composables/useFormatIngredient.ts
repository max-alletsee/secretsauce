// frontend/src/composables/useFormatIngredient.ts
import type { Ingredient } from '@/types/recipe'

export function formatIngredient(ing: Ingredient): string {
  const parts: string[] = []
  if (ing.quantity) parts.push(ing.quantity)
  if (ing.unit) parts.push(ing.unit)
  parts.push(ing.name)
  return parts.join(' ')
}
