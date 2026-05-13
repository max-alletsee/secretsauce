<script setup lang="ts">
import { ref } from 'vue'
import MealSuggestionChip from './MealSuggestionChip.vue'
import type { MealSuggestion } from '@/types/mealPlan'

defineProps<{ suggestions: MealSuggestion[]; loading: boolean; convertingTitle?: string | null }>()
const emit = defineEmits<{
  (e: 'regenerate', steerPrompt?: string): void
  (e: 'drop-to-plan', suggestion: MealSuggestion, date: string, mealType: string): void
  (e: 'drop-to-shortlist', suggestion: MealSuggestion): void
  (e: 'convert-to-recipe', title: string): void
  (e: 'open-recipe', recipeId: string): void
}>()

const steerVisible = ref(false)
const steerPrompt = ref('')

function toggleSteer() {
  steerVisible.value = !steerVisible.value
}

function submitSteer() {
  emit('regenerate', steerPrompt.value || undefined)
  steerVisible.value = false
  steerPrompt.value = ''
}

function handleConvertToRecipe(title: string) {
  emit('convert-to-recipe', title)
}
</script>

<template>
  <div class="suggestion-panel">
    <div class="panel-header">
      <span class="panel-label">AI Suggestions</span>
      <div class="panel-actions">
        <button
          class="btn-steer"
          data-testid="steer-toggle"
          @click="toggleSteer"
        >
          ✏ Steer…
        </button>
        <button
          class="btn-regen"
          data-testid="regen-btn"
          @click="emit('regenerate', undefined)"
        >
          ⚡ Regen
        </button>
      </div>
    </div>

    <div v-if="steerVisible" class="steer-field">
      <input
        v-model="steerPrompt"
        data-testid="steer-input"
        type="text"
        placeholder="e.g. I have leftover salad · need something quick"
      />
      <button data-testid="steer-submit" class="btn-go" @click="submitSteer">Go</button>
    </div>

    <div v-if="loading" data-testid="suggestions-loading" class="loading-chips">
      Generating suggestions…
    </div>

    <div v-else class="chips-grid">
      <MealSuggestionChip
        v-for="(s, i) in suggestions"
        :key="i"
        :suggestion="s"
        :converting="convertingTitle === s.title"
        @convert-to-recipe="handleConvertToRecipe"
        @open-recipe="(id) => emit('open-recipe', id)"
      />
      <span v-if="suggestions.length === 0 && !loading" class="empty-hint">
        Click Regen to generate suggestions
      </span>
    </div>
  </div>
</template>

<style scoped>
.suggestion-panel {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.panel-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  font-weight: 600;
}
.panel-actions {
  display: flex;
  gap: 0.5rem;
}
.btn-steer {
  background: #e9ecef;
  border: none;
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.btn-regen {
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.steer-field {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.steer-field input {
  flex: 1;
  padding: 0.35rem 0.65rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 0.875rem;
}
.btn-go {
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  font-size: 0.875rem;
}
.chips-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.empty-hint {
  font-size: 0.8rem;
  color: #aaa;
  font-style: italic;
}
.loading-chips {
  font-size: 0.85rem;
  color: #888;
  font-style: italic;
}
</style>
