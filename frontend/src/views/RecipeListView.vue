<!-- frontend/src/views/RecipeListView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRecipeStore } from '@/stores/useRecipeStore'
import * as importTasksApi from '@/api/importTasks'
import RecipeCard from '@/components/RecipeCard.vue'
import TagFilter from '@/components/TagFilter.vue'

const recipeStore = useRecipeStore()
const router = useRouter()
const selectedTags = ref<string[]>([])

// ── Import state ──────────────────────────────────────────────────────────────
const importUrl = ref('')
const importStatus = ref<'idle' | 'pending' | 'processing' | 'completed' | 'failed'>('idle')
const importError = ref<string | null>(null)
const pollInterval = ref<ReturnType<typeof setInterval> | null>(null)

function stopPolling() {
  if (pollInterval.value !== null) {
    clearInterval(pollInterval.value)
    pollInterval.value = null
  }
}

async function submitImport() {
  if (!importUrl.value || importStatus.value === 'pending' || importStatus.value === 'processing') return
  importError.value = null
  importStatus.value = 'pending'

  try {
    const { data } = await importTasksApi.importRecipeFromUrl(importUrl.value)
    const taskId = data.task_id

    pollInterval.value = setInterval(async () => {
      try {
        const { data: task } = await importTasksApi.getImportTask(taskId)
        importStatus.value = task.status

        if (task.status === 'completed' && task.recipe_id) {
          stopPolling()
          router.push(`/recipes/${task.recipe_id}/edit`)
        } else if (task.status === 'failed') {
          stopPolling()
          importError.value = task.error_message ?? 'Import failed'
        }
      } catch {
        stopPolling()
        importError.value = 'Failed to check import status'
        importStatus.value = 'failed'
      }
    }, 3000)
  } catch {
    importStatus.value = 'failed'
    importError.value = 'Failed to start import. Please try again.'
  }
}

onMounted(() => {
  recipeStore.fetchRecipes()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <main class="recipe-list-page">
    <header class="recipe-list-page__header">
      <h1>Recipes</h1>
    </header>

    <section class="import-section">
      <div class="import-section__form">
        <input
          v-model="importUrl"
          data-testid="import-url-input"
          type="url"
          placeholder="Paste a recipe URL to import…"
          :disabled="importStatus === 'pending' || importStatus === 'processing'"
          class="import-section__input"
          @keyup.enter="submitImport"
        />
        <button
          data-testid="import-submit-btn"
          :disabled="!importUrl || importStatus === 'pending' || importStatus === 'processing'"
          class="import-section__btn"
          @click="submitImport"
        >
          <span v-if="importStatus === 'pending' || importStatus === 'processing'">
            <span data-testid="import-spinner" aria-hidden="true">⏳</span>
            Importing…
          </span>
          <span v-else>Import</span>
        </button>
      </div>
      <p v-if="importError" data-testid="import-error" class="import-section__error">
        {{ importError }}
      </p>
    </section>

    <TagFilter v-model="selectedTags" class="recipe-list-page__filters" />

    <p v-if="recipeStore.loading && !recipeStore.recipes.length" class="recipe-list-page__loading">
      Loading recipes…
    </p>

    <p v-else-if="!recipeStore.recipes.length" class="recipe-list-page__empty">
      No recipes yet. Create your first one!
    </p>

    <div v-else class="recipe-grid">
      <RecipeCard
        v-for="recipe in recipeStore.recipes"
        :key="recipe.id"
        :recipe="recipe"
      />
    </div>

    <button
      v-if="recipeStore.hasMore && recipeStore.recipes.length"
      class="recipe-list-page__load-more"
      :disabled="recipeStore.loading"
      @click="recipeStore.loadMore()"
    >
      {{ recipeStore.loading ? 'Loading…' : 'Load more' }}
    </button>

    <RouterLink to="/recipes/new" class="fab" aria-label="Create recipe">+</RouterLink>
  </main>
</template>

<style scoped>
.recipe-list-page {
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}
.recipe-list-page__header {
  margin-bottom: 1rem;
}
.recipe-list-page__header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}
.recipe-list-page__loading,
.recipe-list-page__empty {
  text-align: center;
  color: #6b7280;
  padding: 3rem 0;
}
.import-section {
  margin-bottom: 1.5rem;
}
.import-section__form {
  display: flex;
  gap: 0.5rem;
}
.import-section__input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}
.import-section__input:disabled {
  background: #f9fafb;
  color: #9ca3af;
}
.import-section__btn {
  padding: 0.5rem 1rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
}
.import-section__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.import-section__error {
  margin-top: 0.5rem;
  color: #dc2626;
  font-size: 0.875rem;
}
.recipe-list-page__filters {
  margin-bottom: 1.5rem;
}
.recipe-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}
@media (min-width: 768px) {
  .recipe-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (min-width: 1024px) {
  .recipe-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
.recipe-list-page__load-more {
  display: block;
  margin: 1.5rem auto 0;
  padding: 0.625rem 2rem;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
  cursor: pointer;
}
.recipe-list-page__load-more:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.fab {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  width: 3.5rem;
  height: 3.5rem;
  background: #2563eb;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  text-decoration: none;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
}
</style>
