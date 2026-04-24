<!-- frontend/src/components/TagSelector.vue -->
<script setup lang="ts">
const model = defineModel<string[]>({ default: () => [] })

const TAG_GROUPS: { label: string; tags: string[] }[] = [
  { label: 'Protein', tags: ['vegan', 'vegetarian', 'fish', 'poultry', 'meat', 'seafood'] },
  {
    label: 'Diet',
    tags: [
      'low-calorie', 'high-calorie', 'low-carb', 'high-protein',
      'gluten-free', 'dairy-free', 'keto', 'paleo', 'mediterranean',
    ],
  },
  { label: 'Season', tags: ['spring', 'summer', 'autumn', 'winter'] },
  { label: 'Meal type', tags: ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'] },
  {
    label: 'Cuisine',
    tags: [
      'italian', 'mexican', 'japanese', 'chinese', 'indian',
      'thai', 'french', 'greek', 'middle-eastern', 'american', 'korean',
    ],
  },
]

function toggle(tag: string) {
  const current = model.value
  if (current.includes(tag)) {
    model.value = current.filter((t) => t !== tag)
  } else {
    model.value = [...current, tag]
  }
}
</script>

<template>
  <div class="tag-selector">
    <p class="tag-selector__hint">Choose from categories</p>
    <fieldset v-for="group in TAG_GROUPS" :key="group.label" class="tag-selector__group">
      <legend class="tag-selector__legend">{{ group.label }}</legend>
      <div class="tag-selector__chips">
        <button
          v-for="tag in group.tags"
          :key="tag"
          type="button"
          class="tag-selector__chip"
          :class="{ 'tag-selector__chip--active': model.includes(tag) }"
          @click="toggle(tag)"
        >
          {{ tag }}
        </button>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.tag-selector {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.tag-selector__group {
  border: none;
  padding: 0;
  margin: 0;
}
.tag-selector__legend {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.375rem;
}
.tag-selector__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.tag-selector__chip {
  padding: 0.25rem 0.625rem;
  border: 1px solid #d1d5db;
  border-radius: 1rem;
  background: white;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.1s;
}
.tag-selector__chip--active {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}
.tag-selector__hint {
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0 0 0.5rem;
}
</style>
