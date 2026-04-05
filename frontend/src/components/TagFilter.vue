<script setup lang="ts">
import { ref, computed } from 'vue'

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

const isExpanded = ref(false)

const activeCount = computed(() => model.value.length)

function togglePanel() {
  isExpanded.value = !isExpanded.value
}

function toggleTag(tag: string) {
  const current = model.value
  if (current.includes(tag)) {
    model.value = current.filter((t) => t !== tag)
  } else {
    model.value = [...current, tag]
  }
}

function clearAll() {
  model.value = []
}
</script>

<template>
  <div class="tag-filter">
    <div class="tag-filter__header">
      <button
        type="button"
        class="tag-filter__toggle"
        data-testid="tag-filter-toggle"
        :aria-expanded="isExpanded"
        @click="togglePanel"
      >
        <span v-if="activeCount > 0">Filter ({{ activeCount }})</span>
        <span v-else>Filter</span>
      </button>
      <button
        v-if="activeCount > 0"
        type="button"
        class="tag-filter__clear"
        data-testid="tag-filter-clear"
        @click="clearAll"
      >
        Clear all
      </button>
    </div>

    <div class="tag-filter__panel" :class="{ 'tag-filter__panel--expanded': isExpanded }">
      <fieldset
        v-for="group in TAG_GROUPS"
        :key="group.label"
        class="tag-filter__group"
      >
        <legend class="tag-filter__legend">{{ group.label }}</legend>
        <div class="tag-filter__chips">
          <button
            v-for="tag in group.tags"
            :key="tag"
            type="button"
            class="tag-filter__chip"
            :class="{ 'tag-filter__chip--active': model.includes(tag) }"
            @click="toggleTag(tag)"
          >
            {{ tag }}
          </button>
        </div>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.tag-filter {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tag-filter__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.tag-filter__toggle {
  padding: 0.375rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.1s;
}

.tag-filter__toggle:hover {
  background: #f9fafb;
}

.tag-filter__clear {
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 0.375rem;
  background: none;
  font-size: 0.875rem;
  color: #6b7280;
  cursor: pointer;
  text-decoration: underline;
}

.tag-filter__clear:hover {
  color: #374151;
}

/* Mobile: panel hidden by default, shown when expanded */
.tag-filter__panel {
  display: none;
  flex-direction: column;
  gap: 0.75rem;
}

.tag-filter__panel--expanded {
  display: flex;
}

/* Desktop: always show panel, hide toggle */
@media (min-width: 768px) {
  .tag-filter__toggle {
    display: none;
  }

  .tag-filter__panel {
    display: flex;
  }
}

.tag-filter__group {
  border: none;
  padding: 0;
  margin: 0;
}

.tag-filter__legend {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.375rem;
}

.tag-filter__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.tag-filter__chip {
  padding: 0.25rem 0.625rem;
  border: 1px solid #d1d5db;
  border-radius: 1rem;
  background: white;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.1s;
}

.tag-filter__chip--active {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}
</style>
