// frontend/src/stores/useRecipeStore.ts
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import * as recipesApi from '@/api/recipes'
import type {
  Recipe,
  RecipeCreatePayload,
  RecipeUpdatePayload,
  RecipeVersion,
} from '@/types/recipe'

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: unknown[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

export const useRecipeStore = defineStore('recipes', () => {
  const recipes = ref<Recipe[]>([])
  const currentRecipe = ref<Recipe | null>(null)
  const versions = ref<RecipeVersion[]>([])
  const loading = ref(false)
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(true)

  // Search / filter / sort state
  const searchQuery = ref('')
  const selectedTags = ref<string[]>([])
  const sortBy = ref('created_at_desc')
  const popularityAvailable = ref(false)

  async function fetchRecipes() {
    recipes.value = []
    nextCursor.value = null
    hasMore.value = true
    loading.value = true
    try {
      const { data } = await recipesApi.getRecipes({
        q: searchQuery.value || undefined,
        tags: selectedTags.value.length ? selectedTags.value : undefined,
        sort_by: sortBy.value,
      })
      recipes.value = data.items
      nextCursor.value = data.next_cursor
      hasMore.value = data.has_more
      popularityAvailable.value = data.popularity_sort_available ?? false
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!hasMore.value || loading.value) return
    loading.value = true
    try {
      const { data } = await recipesApi.getRecipes({
        cursor: nextCursor.value ?? undefined,
        q: searchQuery.value || undefined,
        tags: selectedTags.value.length ? selectedTags.value : undefined,
        sort_by: sortBy.value,
      })
      recipes.value.push(...data.items)
      nextCursor.value = data.next_cursor
      hasMore.value = data.has_more
    } finally {
      loading.value = false
    }
  }

  // Watchers: search is debounced; tag/sort changes are immediate
  // selectedTags needs deep:true because we replace the array reference on each change
  watch(searchQuery, debounce(fetchRecipes, 300))
  watch(selectedTags, fetchRecipes, { deep: true })
  watch(sortBy, fetchRecipes)

  async function fetchRecipe(id: string) {
    loading.value = true
    try {
      const { data } = await recipesApi.getRecipe(id)
      currentRecipe.value = data
    } finally {
      loading.value = false
    }
  }

  async function createRecipe(payload: RecipeCreatePayload): Promise<Recipe> {
    loading.value = true
    try {
      const { data } = await recipesApi.createRecipe(payload)
      return data
    } finally {
      loading.value = false
    }
  }

  async function updateRecipe(id: string, payload: RecipeUpdatePayload) {
    loading.value = true
    try {
      const { data } = await recipesApi.updateRecipe(id, payload)
      currentRecipe.value = data
    } finally {
      loading.value = false
    }
  }

  async function deleteRecipe(id: string) {
    loading.value = true
    try {
      await recipesApi.deleteRecipe(id)
      recipes.value = recipes.value.filter((r) => r.id !== id)
      if (currentRecipe.value?.id === id) currentRecipe.value = null
    } finally {
      loading.value = false
    }
  }

  async function fetchVersions(id: string) {
    loading.value = true
    try {
      const { data } = await recipesApi.getVersions(id)
      versions.value = data
    } finally {
      loading.value = false
    }
  }

  async function restoreVersion(recipeId: string, versionId: string) {
    loading.value = true
    try {
      const { data } = await recipesApi.restoreVersion(recipeId, versionId)
      currentRecipe.value = data
      await fetchVersions(recipeId)
    } finally {
      loading.value = false
    }
  }

  return {
    recipes,
    currentRecipe,
    versions,
    loading,
    nextCursor,
    hasMore,
    searchQuery,
    selectedTags,
    sortBy,
    popularityAvailable,
    fetchRecipes,
    loadMore,
    fetchRecipe,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    fetchVersions,
    restoreVersion,
  }
})
