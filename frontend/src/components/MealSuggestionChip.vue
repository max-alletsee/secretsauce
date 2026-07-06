<script setup lang="ts">
import AddToPlanButton from './AddToPlanButton.vue'
import BaseIcon from '@/components/base/BaseIcon.vue'
import { BookOpen, Lightbulb } from '@lucide/vue'
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
    <span class="chip-icon">
      <BaseIcon
        :icon="suggestion.entry_type === 'recipe' ? BookOpen : Lightbulb"
        :size="16"
        :label="suggestion.entry_type === 'recipe' ? 'Recipe' : 'Idea'"
      />
    </span>
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
  background: var(--color-primary-soft);
  border-left: 3px solid var(--color-primary);
  cursor: pointer;
}
.suggestion-chip.suggestion {
  background: var(--color-accent-soft);
  border-left: 3px solid var(--color-accent);
  font-style: italic;
}
.chip-icon {
  display: inline-flex;
  align-items: center;
}
.convert-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
  margin-left: 0.25rem;
}
.convert-btn:hover { color: var(--color-text); }
.convert-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
