<!-- frontend/src/components/RecipeCard.vue -->
<script setup lang="ts">
import type { Recipe } from '@/types/recipe'

const props = defineProps<{
  recipe: Recipe
}>()

const MAX_VISIBLE_TAGS = 3
const visibleTags = props.recipe.current_version.tags.slice(0, MAX_VISIBLE_TAGS)
const extraTagCount = Math.max(0, props.recipe.current_version.tags.length - MAX_VISIBLE_TAGS)
</script>

<template>
  <RouterLink :to="`/recipes/${recipe.id}`" class="recipe-card">
    <h3 class="recipe-card__title">{{ recipe.current_version.title }}</h3>
    <div class="recipe-card__meta">
      <span v-if="recipe.current_version.total_time_minutes">
        {{ recipe.current_version.total_time_minutes }} min
      </span>
      <span v-if="recipe.current_version.servings">
        {{ recipe.current_version.servings }} servings
      </span>
    </div>
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
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s;
}
.recipe-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.recipe-card__title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}
.recipe-card__meta {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: #6b7280;
}
.recipe-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.recipe-card__tag {
  padding: 0.125rem 0.5rem;
  background: #f3f4f6;
  border-radius: 1rem;
  font-size: 0.75rem;
  color: #374151;
}
.recipe-card__tag--more {
  background: #e5e7eb;
  color: #6b7280;
}
</style>
