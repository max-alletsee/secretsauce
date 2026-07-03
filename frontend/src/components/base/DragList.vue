<script setup lang="ts" generic="T extends Record<string, unknown>">
import { ChevronUp, ChevronDown } from '@lucide/vue'
import IconButton from './IconButton.vue'
import { moveItem } from './moveItem'

const props = defineProps<{
  items: T[]
  keyField: keyof T
}>()

const emit = defineEmits<{
  'update:items': [items: T[]]
}>()

function moveUp(index: number) {
  if (index <= 0) return
  emit('update:items', moveItem(props.items, index, index - 1))
}

function moveDown(index: number) {
  if (index >= props.items.length - 1) return
  emit('update:items', moveItem(props.items, index, index + 1))
}
</script>

<template>
  <ul class="drag-list" role="list">
    <li
      v-for="(item, i) in items"
      :key="String(item[keyField])"
      class="drag-list__row"
      data-drag-row
    >
      <div class="drag-list__controls">
        <IconButton
          :icon="ChevronUp"
          label="Move up"
          variant="ghost"
          :size="20"
          :disabled="i === 0"
          @click="moveUp(i)"
        />
        <IconButton
          :icon="ChevronDown"
          label="Move down"
          variant="ghost"
          :size="20"
          :disabled="i === items.length - 1"
          @click="moveDown(i)"
        />
      </div>

      <div class="drag-list__content">
        <slot :item="item" :index="i" />
      </div>
    </li>
  </ul>
</template>

<style scoped>
.drag-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.drag-list__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}

.drag-list__row:last-child {
  border-bottom: none;
}

.drag-list__controls {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex-shrink: 0;
}

.drag-list__content {
  flex: 1;
  min-width: 0;
}
</style>
