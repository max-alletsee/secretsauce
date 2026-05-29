<script setup lang="ts">
import AddToPlanButton from './AddToPlanButton.vue'
import type { MealSuggestion } from '@/types/mealPlan'

const props = defineProps<{ suggestion: MealSuggestion; converting?: boolean }>()
const emit = defineEmits<{
  (e: 'convert-to-recipe', title: string): void
  (e: 'open-recipe', recipeId: string): void
}>()
</script>

<template>
  <div
    class="suggestion-chip"
    :class="suggestion.entry_type"
    :data-testid="`chip-${suggestion.entry_type}`"
    @click.stop="suggestion.entry_type === 'recipe' && suggestion.matched_recipe_id && emit('open-recipe', suggestion.matched_recipe_id)"
  >
    <span class="chip-icon">{{ suggestion.entry_type === 'recipe' ? '📚' : '✨' }}</span>
    <span class="chip-title">{{ suggestion.title }}</span>
    <AddToPlanButton
      :source="{ kind: 'suggestion', title: props.suggestion.title, matchedRecipeId: props.suggestion.matched_recipe_id }"
      :label="`Add ${props.suggestion.title} to meal plan`"
    />
    <button
      v-if="suggestion.entry_type === 'suggestion'"
      class="convert-btn"
      data-testid="convert-to-recipe"
      :disabled="converting"
      @click.stop="!converting && emit('convert-to-recipe', suggestion.title)"
    >
      {{ converting ? '…' : '→ recipe' }}
    </button>
  </div>
</template>

<style scoped>
.suggestion-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-size: 0.875rem;
  user-select: none;
}
.suggestion-chip.recipe {
  background: #e8f0fe;
  border-left: 3px solid #4285f4;
  cursor: pointer;
}
.suggestion-chip.suggestion {
  background: #fff8e1;
  border-left: 3px solid #f5a623;
  font-style: italic;
}
.convert-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
  margin-left: 0.25rem;
}
.convert-btn:hover { color: #333; }
.convert-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
