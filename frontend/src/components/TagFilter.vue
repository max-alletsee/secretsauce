<script setup lang="ts">
import { computed, ref } from 'vue'
import ToggleChip from '@/components/base/ToggleChip.vue'
import BaseIcon from '@/components/base/BaseIcon.vue'
import { ChevronUp, ChevronDown } from '@lucide/vue'

const model = defineModel<string[]>({ default: () => [] })

const expanded = ref(false)

function toggleExpanded() {
  expanded.value = !expanded.value
}

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

const activeCount = computed(() => model.value.length)

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
        :aria-expanded="expanded"
        @click="toggleExpanded"
      >
        <span class="tag-filter__count">
          <span v-if="activeCount > 0">Filters ({{ activeCount }})</span>
          <span v-else>Filters</span>
        </span>
        <BaseIcon :icon="expanded ? ChevronUp : ChevronDown" />
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

    <div v-if="expanded" class="tag-filter__groups">
      <fieldset
        v-for="group in TAG_GROUPS"
        :key="group.label"
        class="tag-filter__group"
      >
        <legend class="tag-filter__legend">{{ group.label }}</legend>
        <div class="tag-filter__chips">
          <ToggleChip
            v-for="tag in group.tags"
            :key="tag"
            :model-value="model.includes(tag)"
            :label="tag"
            @update:model-value="toggleTag(tag)"
          />
        </div>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.tag-filter {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  position: sticky;
  top: 0;
  background: var(--color-bg);
  z-index: 10;
  padding-top: var(--space-2);
  padding-bottom: var(--space-2);
}

.tag-filter__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.tag-filter__toggle {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  color: var(--color-text);
}

.tag-filter__count {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text);
}

.tag-filter__clear {
  padding: var(--space-1) var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  text-decoration: underline;
}

.tag-filter__clear:hover {
  color: var(--color-text);
}

.tag-filter__groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tag-filter__group {
  border: none;
  padding: 0;
  margin: 0;
  min-width: 0;
}

.tag-filter__legend {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-1);
}

.tag-filter__chips {
  display: flex;
  flex-wrap: nowrap;
  gap: var(--space-2);
  overflow-x: auto;
  padding-bottom: var(--space-1);
}
</style>
