<!-- frontend/src/views/RecipeListView.vue -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, type HistoryState } from 'vue-router'
import { useRecipeStore } from '@/stores/useRecipeStore'
import * as importTasksApi from '@/api/importTasks'
import RecipeCard from '@/components/RecipeCard.vue'
import SearchBar from '@/components/SearchBar.vue'
import SortControl from '@/components/SortControl.vue'
import TagFilter from '@/components/TagFilter.vue'
import { useImportPolling } from '@/composables/useImportPolling'
import type { RecipeData } from '@/types/importTask'

const recipeStore = useRecipeStore()
const router = useRouter()

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
  } catch {
    importStatus.value = 'failed'
    importError.value = 'Failed to start import. Please try again.'
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
  } catch {
    importStatus.value = 'failed'
    importError.value = 'Failed to start image import. Please try again.'
  }
}

onMounted(() => {
  recipeStore.fetchRecipes()
})
</script>

<template>
  <main class="recipe-list-page">
    <header class="recipe-list-page__header">
      <h1>Recipes</h1>
    </header>

    <section class="import-section">
      <div class="import-section__url-row">
        <input
          v-model="importUrl"
          data-testid="import-url-input"
          type="url"
          placeholder="Paste a recipe URL to import…"
          :disabled="isImporting"
          class="import-section__input"
          @keyup.enter="submitUrlImport"
        />
        <button
          data-testid="import-submit-btn"
          :disabled="!importUrl || isImporting"
          class="import-section__btn"
          @click="submitUrlImport"
        >
          <span v-if="isImporting">
            <span data-testid="import-spinner" aria-hidden="true">⏳</span>
            Importing…
          </span>
          <span v-else>Import</span>
        </button>
      </div>

      <div class="import-section__image-row">
        <!-- Hidden native file input -->
        <input
          ref="imageInputRef"
          data-testid="import-image-input"
          type="file"
          accept="image/*"
          capture="environment"
          class="import-section__image-input"
          :disabled="isImporting"
          @change="handleImageChange"
        />
        <button
          data-testid="import-image-btn"
          type="button"
          :disabled="isImporting"
          class="import-section__image-btn"
          @click="imageInputRef?.click()"
        >
          📷 Import from photo
        </button>
      </div>

      <p v-if="importError" data-testid="import-error" class="import-section__error">
        {{ importError }}
      </p>
    </section>

    <section class="search-section">
      <SearchBar
        v-model="recipeStore.searchQuery"
        data-testid="recipe-search-bar"
        class="search-section__bar"
      />
      <SortControl
        v-model="recipeStore.sortBy"
        :popularity-available="recipeStore.popularityAvailable"
        data-testid="recipe-sort-control"
        class="search-section__sort"
      />
    </section>

    <TagFilter
      v-model="recipeStore.selectedTags"
      data-testid="recipe-tag-filter"
      class="recipe-list-page__filters"
    />

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
.recipe-list-page__filters {
  margin-bottom: 1.5rem;
}
.import-section {
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.import-section__url-row {
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
.import-section__image-row {
  display: flex;
  align-items: center;
}
.import-section__image-input {
  display: none;
}
.import-section__image-btn {
  padding: 0.5rem 1rem;
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.import-section__image-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.import-section__error {
  color: #dc2626;
  font-size: 0.875rem;
}
.search-section {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1rem;
}
.search-section__bar {
  flex: 1;
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
@media (min-width: 1024px) {
  .fab {
    display: none;
  }
}
</style>
