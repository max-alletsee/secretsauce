<script setup lang="ts">
import { ref } from 'vue'
import MealSuggestionChip from './MealSuggestionChip.vue'
import BaseIcon from '@/components/base/BaseIcon.vue'
import PourLoader from '@/components/base/PourLoader.vue'
import { Pencil, RefreshCw } from '@lucide/vue'
import type { MealSuggestion } from '@/types/mealPlan'

defineProps<{
  suggestions: MealSuggestion[]
  loading: boolean
  convertingTitle?: string | null
  error?: string | null
}>()
const emit = defineEmits<{
  (e: 'regenerate', steerPrompt?: string): void
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
      <span class="panel-label">Today's ideas</span>
      <div class="panel-actions">
        <button
          class="btn-steer"
          data-testid="steer-toggle"
          @click="toggleSteer"
        >
          <BaseIcon :icon="Pencil" /> Steer…
        </button>
        <button
          class="btn-regen"
          data-testid="regen-btn"
          aria-label="Another idea"
          @click="emit('regenerate', undefined)"
        >
          <BaseIcon :icon="RefreshCw" :size="16" /> Another idea
        </button>
      </div>
    </div>

    <p v-if="error" class="suggestion-error">{{ error }}</p>

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
      <PourLoader label="Generating suggestions" />
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
        Click "Another idea" to see suggestions
      </span>
    </div>
  </div>
</template>

<style scoped>
.suggestion-panel {
  background: var(--color-surface-2);
  border-radius: var(--radius-sm);
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
  color: var(--color-text-muted);
  font-weight: 600;
}
.panel-actions {
  display: flex;
  gap: 0.5rem;
}
.btn-steer {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--color-surface);
  border: none;
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.btn-regen {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--color-primary);
  color: var(--color-primary-ink);
  border: none;
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.suggestion-error {
  color: var(--color-danger);
  font-size: 13px;
  margin: 8px 0;
}
.steer-field {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.steer-field input {
  flex: 1;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.875rem;
}
.btn-go {
  background: var(--color-primary);
  color: var(--color-primary-ink);
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
  color: var(--color-text-muted);
  font-style: italic;
}
.loading-chips {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  font-style: italic;
}
</style>
