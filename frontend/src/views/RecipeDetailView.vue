<!-- frontend/src/views/RecipeDetailView.vue -->
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRecipeStore } from '@/stores/useRecipeStore'
import { useUserStore } from '@/stores/useUserStore'
import VersionHistoryPanel from '@/components/VersionHistoryPanel.vue'
import { formatIngredient } from '@/composables/useFormatIngredient'

const route = useRoute()
const router = useRouter()
const recipeStore = useRecipeStore()
const userStore = useUserStore()

const error = ref('')
const deleting = ref(false)
const isNotFound = ref(false)
const confirmingDelete = ref(false)

const recipe = computed(() => recipeStore.currentRecipe)
const isOwner = computed(() => recipe.value?.owner_id === userStore.user?.id)

async function loadRecipe() {
  error.value = ''
  isNotFound.value = false
  try {
    await recipeStore.fetchRecipe(route.params.id as string)
    await recipeStore.fetchVersions(route.params.id as string)
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) {
      const response = (e as { response?: { status?: number } }).response
      if (response?.status === 404) {
        isNotFound.value = true
        error.value = 'Recipe not found.'
      } else {
        error.value = 'Failed to load recipe.'
      }
    } else {
      error.value = 'Failed to load recipe.'
    }
  }
}

onMounted(loadRecipe)

function handleDelete() {
  confirmingDelete.value = true
}

async function confirmDelete() {
  if (!recipe.value) return
  confirmingDelete.value = false
  deleting.value = true
  try {
    await recipeStore.deleteRecipe(recipe.value.id)
    router.push('/recipes')
  } catch {
    error.value = 'Failed to delete recipe.'
    deleting.value = false
  }
}

async function handleRestore(versionId: string) {
  if (!recipe.value) return
  try {
    await recipeStore.restoreVersion(recipe.value.id, versionId)
  } catch {
    error.value = 'Failed to restore version.'
  }
}

</script>

<template>
  <main class="recipe-detail">
    <div v-if="error" class="recipe-detail__error">
      <p>{{ error }}</p>
      <div class="recipe-detail__error-actions">
        <button v-if="!isNotFound" type="button" class="btn btn--secondary" @click="loadRecipe">
          Try again
        </button>
        <RouterLink to="/recipes">Back to recipes</RouterLink>
      </div>
    </div>

    <div v-else-if="recipeStore.loading && !recipe" class="recipe-detail__loading">
      Loading…
    </div>

    <template v-else-if="recipe">
      <header class="recipe-detail__header">
        <h1>{{ recipe.current_version.title }}</h1>
        <div v-if="isOwner" class="recipe-detail__owner-actions">
          <RouterLink :to="`/recipes/${recipe.id}/edit`" class="btn btn--secondary">
            Edit
          </RouterLink>
          <template v-if="confirmingDelete">
            <button class="btn btn--danger" @click="confirmDelete">Yes, delete</button>
            <button class="btn btn--secondary" @click="confirmingDelete = false">Cancel</button>
          </template>
          <button
            v-else
            data-testid="delete-recipe"
            class="btn btn--danger"
            :disabled="deleting"
            @click="handleDelete"
          >
            {{ deleting ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </header>

      <p v-if="recipe.current_version.description" class="recipe-detail__description">
        {{ recipe.current_version.description }}
      </p>

      <div class="recipe-detail__meta">
        <span v-if="recipe.current_version.servings">
          {{ recipe.current_version.servings }} servings
        </span>
        <span v-if="recipe.current_version.total_time_minutes">
          {{ recipe.current_version.total_time_minutes }} min total
        </span>
        <span v-if="recipe.current_version.prep_time_minutes">
          {{ recipe.current_version.prep_time_minutes }} min prep
        </span>
        <span v-if="recipe.current_version.cook_time_minutes">
          {{ recipe.current_version.cook_time_minutes }} min cook
        </span>
        <span class="recipe-detail__badge">{{ recipe.visibility }}</span>
      </div>

      <section class="recipe-detail__section">
        <h2>Ingredients</h2>
        <ul class="recipe-detail__ingredients">
          <li v-for="(ing, i) in recipe.current_version.ingredients" :key="i">
            {{ formatIngredient(ing) }}
          </li>
        </ul>
      </section>

      <section class="recipe-detail__section">
        <h2>Steps</h2>
        <ol class="recipe-detail__steps">
          <li v-for="step in recipe.current_version.steps" :key="step.order">
            {{ step.instruction }}
          </li>
        </ol>
      </section>

      <section v-if="recipe.current_version.tags.length" class="recipe-detail__section">
        <h2>Tags</h2>
        <div class="recipe-detail__tags">
          <span v-for="tag in recipe.current_version.tags" :key="tag" class="recipe-detail__tag">
            {{ tag }}
          </span>
        </div>
      </section>

      <VersionHistoryPanel
        v-if="recipeStore.versions.length"
        :versions="recipeStore.versions"
        :current-version-number="recipe.current_version.version_number"
        @restore="handleRestore"
      />
    </template>
  </main>
</template>

<style scoped>
.recipe-detail {
  padding: 1rem;
  max-width: 720px;
  margin: 0 auto;
}
.recipe-detail__error {
  text-align: center;
  padding: 3rem 0;
  color: #dc2626;
}
.recipe-detail__error a {
  display: inline-block;
  margin-top: 1rem;
  color: #2563eb;
}
.recipe-detail__error-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1rem;
  align-items: center;
}
.recipe-detail__loading {
  text-align: center;
  padding: 3rem 0;
  color: #6b7280;
}
.recipe-detail__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}
.recipe-detail__header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0;
}
.recipe-detail__owner-actions {
  display: flex;
  gap: 0.5rem;
}
.recipe-detail__description {
  color: #4b5563;
  margin: 0.5rem 0 0;
}
.recipe-detail__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 1rem 0;
  font-size: 0.875rem;
  color: #6b7280;
}
.recipe-detail__badge {
  padding: 0.125rem 0.5rem;
  background: #f3f4f6;
  border-radius: 1rem;
  font-size: 0.75rem;
  text-transform: capitalize;
}
.recipe-detail__section {
  margin: 1.5rem 0;
}
.recipe-detail__section h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
}
.recipe-detail__ingredients {
  list-style: disc inside;
  padding: 0;
  margin: 0;
}
.recipe-detail__ingredients li {
  padding: 0.25rem 0;
}
.recipe-detail__steps {
  padding-left: 1.25rem;
  margin: 0;
}
.recipe-detail__steps li {
  padding: 0.375rem 0;
  line-height: 1.5;
}
.recipe-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.recipe-detail__tag {
  padding: 0.25rem 0.625rem;
  background: #f3f4f6;
  border-radius: 1rem;
  font-size: 0.8125rem;
  color: #374151;
}
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  text-decoration: none;
}
.btn--secondary { background: #f3f4f6; color: #374151; }
.btn--danger { background: #dc2626; color: white; }
.btn--danger:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
