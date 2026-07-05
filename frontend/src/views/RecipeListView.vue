<!-- frontend/src/views/RecipeListView.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRecipeStore } from '@/stores/useRecipeStore'
import RecipeCard from '@/components/RecipeCard.vue'
import SearchBar from '@/components/SearchBar.vue'
import SortControl from '@/components/SortControl.vue'
import TagFilter from '@/components/TagFilter.vue'
import AddRecipeSheet from '@/components/AddRecipeSheet.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIcon from '@/components/base/BaseIcon.vue'
import PourLoader from '@/components/base/PourLoader.vue'
import { Plus } from '@lucide/vue'

const recipeStore = useRecipeStore()

const sheetOpen = ref(false)

onMounted(() => {
  recipeStore.fetchRecipes()
})
</script>

<template>
  <main class="recipe-list-page">
    <header class="recipe-list-page__header">
      <h1>Recipes</h1>
      <BaseButton
        variant="primary"
        data-testid="add-recipe-btn"
        @click="sheetOpen = true"
      >
        Add recipe
      </BaseButton>
    </header>

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

    <div v-if="recipeStore.loading && !recipeStore.recipes.length" class="recipe-list-page__loading">
      <PourLoader />
    </div>

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

    <button type="button" class="fab" aria-label="Add recipe" @click="sheetOpen = true">
      <BaseIcon :icon="Plus" :size="24" />
    </button>

    <AddRecipeSheet v-if="sheetOpen" @close="sheetOpen = false" />
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.recipe-list-page__header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}
.recipe-list-page__loading,
.recipe-list-page__empty {
  text-align: center;
  color: var(--color-text-muted);
  padding: 3rem 0;
}
.recipe-list-page__filters {
  margin-bottom: 1.5rem;
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
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
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
  background: var(--color-primary);
  color: var(--color-primary-ink);
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  text-decoration: none;
  box-shadow: var(--shadow);
}
@media (min-width: 1024px) {
  .fab {
    display: none;
  }
}
</style>
