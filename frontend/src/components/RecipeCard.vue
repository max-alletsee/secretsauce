<!-- frontend/src/components/RecipeCard.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Clock, Users, Heart } from '@lucide/vue'
import AddToPlanButton from './AddToPlanButton.vue'
import BaseIcon from '@/components/base/BaseIcon.vue'
import IconButton from '@/components/base/IconButton.vue'
import type { Recipe } from '@/types/recipe'

const props = defineProps<{
  recipe: Recipe
}>()

const MAX_VISIBLE_TAGS = 3
const visibleTags = computed(() => props.recipe.current_version.tags.slice(0, MAX_VISIBLE_TAGS))
const extraTagCount = computed(() => Math.max(0, props.recipe.current_version.tags.length - MAX_VISIBLE_TAGS))

// Local, non-persisting favorite affordance — no store/API hook exists yet.
const isFavorite = ref(false)
function toggleFavorite() {
  isFavorite.value = !isFavorite.value
}

const lastCookedLabel = computed(() => {
  if (!props.recipe.last_cooked_at) return null
  return new Date(props.recipe.last_cooked_at).toLocaleDateString()
})
</script>

<template>
  <RouterLink :to="`/recipes/${recipe.id}`" class="recipe-card">
    <div class="recipe-card__top">
      <h3 class="recipe-card__title">{{ recipe.current_version.title }}</h3>
      <div class="recipe-card__actions">
        <IconButton
          :icon="Heart"
          :label="isFavorite ? `Remove ${recipe.current_version.title} from favorites` : `Add ${recipe.current_version.title} to favorites`"
          :size="16"
          variant="ghost"
          data-testid="favorite-toggle"
          :aria-pressed="isFavorite"
          :class="['recipe-card__favorite', { 'recipe-card__favorite--active': isFavorite }]"
          @click.stop.prevent="toggleFavorite"
        />
        <AddToPlanButton
          :source="{ kind: 'recipe', recipeId: recipe.id, title: recipe.current_version.title }"
          :label="`Add ${recipe.current_version.title} to meal plan`"
        />
      </div>
    </div>
    <div class="recipe-card__meta">
      <span v-if="recipe.current_version.total_time_minutes" class="recipe-card__meta-item">
        <BaseIcon :icon="Clock" :size="16" />
        {{ recipe.current_version.total_time_minutes }} min
      </span>
      <span v-if="recipe.current_version.servings" class="recipe-card__meta-item">
        <BaseIcon :icon="Users" :size="16" />
        {{ recipe.current_version.servings }} servings
      </span>
    </div>
    <p v-if="recipe.times_cooked > 0" class="recipe-card__cook-count">
      Cooked {{ recipe.times_cooked }}×<template v-if="lastCookedLabel"> &middot; Last cooked {{ lastCookedLabel }}</template>
    </p>
    <div v-if="recipe.current_version.tags.length" class="recipe-card__tags">
      <span v-for="tag in visibleTags" :key="tag" class="recipe-card__tag">{{ tag }}</span>
      <span v-if="extraTagCount" class="recipe-card__tag recipe-card__tag--more">
        +{{ extraTagCount }} more
      </span>
    </div>
  </RouterLink>
</template>

<style scoped>
.recipe-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s;
}
.recipe-card:hover {
  box-shadow: var(--shadow-sm);
}
@media (prefers-reduced-motion: reduce) {
  .recipe-card {
    transition: none;
  }
}
.recipe-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}
.recipe-card__title {
  font-size: var(--text-lg);
  font-weight: 600;
  margin: 0;
  flex: 1;
}
.recipe-card__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}
.recipe-card__favorite.recipe-card__favorite--active {
  color: var(--color-primary);
}
.recipe-card__meta {
  display: flex;
  gap: var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.recipe-card__meta-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
.recipe-card__cook-count {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.recipe-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.recipe-card__tag {
  padding: 0.125rem var(--space-2);
  background: var(--color-surface-2);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  color: var(--color-text);
}
.recipe-card__tag--more {
  background: var(--color-border);
  color: var(--color-text-muted);
}
</style>
