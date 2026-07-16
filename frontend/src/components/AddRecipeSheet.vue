<!-- frontend/src/components/AddRecipeSheet.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter, type HistoryState } from 'vue-router'
import * as importTasksApi from '@/api/importTasks'
import { getApiErrorDetail } from '@/api/client'
import BottomSheet from '@/components/BottomSheet.vue'
import SegmentedTabs from '@/components/base/SegmentedTabs.vue'
import BaseIcon from '@/components/base/BaseIcon.vue'
import PourLoader from '@/components/base/PourLoader.vue'
import { Camera } from '@lucide/vue'
import { useImportPolling } from '@/composables/useImportPolling'
import type { RecipeData } from '@/types/importTask'

const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()

const activeTab = ref<'url' | 'photo' | 'manual'>('url')
const tabs = [
  { value: 'url', label: 'From URL' },
  { value: 'photo', label: 'From photo' },
  { value: 'manual', label: 'Write manually' },
]

const importUrl = ref('')
const imageInputRef = ref<HTMLInputElement | null>(null)

const { status: importStatus, error: importError, startPolling } = useImportPolling(
  (recipeId: string, recipeData?: RecipeData) => {
    router.push({
      name: 'recipe-edit',
      params: { id: recipeId },
      state: { importedRecipe: (recipeData ?? null) as unknown as HistoryState },
    })
  },
)

const isImporting = computed(
  () => importStatus.value === 'pending' || importStatus.value === 'processing',
)

async function submitUrlImport() {
  if (!importUrl.value || isImporting.value) return
  importError.value = null
  importStatus.value = 'pending'
  try {
    const { data } = await importTasksApi.importRecipeFromUrl(importUrl.value)
    startPolling(data.task_id)
  } catch (err) {
    importStatus.value = 'failed'
    importError.value = getApiErrorDetail(err) ?? 'Failed to start import. Please try again.'
  }
}

async function handleImageChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || isImporting.value) return
  importError.value = null
  importStatus.value = 'pending'
  try {
    const { data } = await importTasksApi.importRecipeFromImage(file)
    startPolling(data.task_id)
  } catch (err) {
    importStatus.value = 'failed'
    importError.value = getApiErrorDetail(err) ?? 'Failed to start image import. Please try again.'
  }
}

function goToManualCreate() {
  router.push({ name: 'recipe-create' })
  emit('close')
}
</script>

<template>
  <BottomSheet title="Add recipe" testid="add-recipe-sheet" @close="emit('close')">
    <SegmentedTabs v-model="activeTab" :tabs="tabs" class="add-recipe-sheet__tabs" />

    <div v-if="activeTab === 'url'" class="add-recipe-sheet__panel">
      <div class="add-recipe-sheet__url-row">
        <input
          v-model="importUrl"
          data-testid="import-url-input"
          type="url"
          placeholder="Paste a recipe URL to import…"
          :disabled="isImporting"
          class="add-recipe-sheet__input"
          @keyup.enter="submitUrlImport"
        />
        <button
          data-testid="import-submit-btn"
          :disabled="!importUrl || isImporting"
          class="add-recipe-sheet__btn"
          @click="submitUrlImport"
        >
          <span v-if="isImporting" class="add-recipe-sheet__btn-loading">
            <span data-testid="import-spinner" aria-hidden="true">
              <PourLoader size="sm" label="Importing" />
            </span>
            Importing…
          </span>
          <span v-else>Import</span>
        </button>
      </div>

      <p v-if="importError" data-testid="import-error" class="add-recipe-sheet__error">
        {{ importError }}
      </p>
    </div>

    <div v-else-if="activeTab === 'photo'" class="add-recipe-sheet__panel">
      <div class="add-recipe-sheet__image-row">
        <!-- Hidden native file input -->
        <input
          ref="imageInputRef"
          data-testid="import-image-input"
          type="file"
          accept="image/*"
          capture="environment"
          class="add-recipe-sheet__image-input"
          :disabled="isImporting"
          @change="handleImageChange"
        />
        <button
          data-testid="import-image-btn"
          type="button"
          :disabled="isImporting"
          class="add-recipe-sheet__image-btn"
          @click="imageInputRef?.click()"
        >
          <span v-if="isImporting" class="add-recipe-sheet__btn-loading">
            <span data-testid="import-spinner" aria-hidden="true">
              <PourLoader size="sm" label="Importing" />
            </span>
            Importing…
          </span>
          <span v-else class="add-recipe-sheet__btn-loading">
            <BaseIcon :icon="Camera" /> Import from photo
          </span>
        </button>
      </div>

      <p v-if="importError" data-testid="import-error" class="add-recipe-sheet__error">
        {{ importError }}
      </p>
    </div>

    <div v-else class="add-recipe-sheet__panel">
      <p class="add-recipe-sheet__manual-copy">
        Prefer to type it out yourself? Start with a blank recipe form.
      </p>
      <button
        type="button"
        data-testid="add-recipe-manual-link"
        class="add-recipe-sheet__btn"
        @click="goToManualCreate"
      >
        Write manually
      </button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.add-recipe-sheet__tabs {
  margin-bottom: var(--space-4);
}
.add-recipe-sheet__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.add-recipe-sheet__url-row {
  display: flex;
  gap: var(--space-2);
}
.add-recipe-sheet__input {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-family: var(--font-sans);
  color: var(--color-text);
  background: var(--color-surface);
}
.add-recipe-sheet__input:disabled {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
}
.add-recipe-sheet__btn {
  padding: var(--space-2) var(--space-4);
  background: var(--color-primary);
  color: var(--color-primary-ink);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.add-recipe-sheet__btn:hover:not(:disabled) {
  filter: brightness(0.92);
}
.add-recipe-sheet__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.add-recipe-sheet__btn-loading {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
.add-recipe-sheet__image-row {
  display: flex;
  align-items: center;
}
.add-recipe-sheet__image-input {
  display: none;
}
.add-recipe-sheet__image-btn {
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface-2);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
}
.add-recipe-sheet__image-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.add-recipe-sheet__error {
  color: var(--color-danger);
  font-size: var(--text-sm);
  margin: 0;
}
.add-recipe-sheet__manual-copy {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  margin: 0;
}
</style>
