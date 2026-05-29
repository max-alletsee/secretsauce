<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { TimelineEntry } from '@/types/timeline'

const props = defineProps<{
  entry: TimelineEntry
  recipeTitle?: string
}>()

const emit = defineEmits<{
  (e: 'open-recipe', recipeId: string): void
  (e: 'move-to-slot'): void
  (e: 'move-to-shortlist'): void
  (e: 'save-to-shortlist'): void
  (e: 'remove'): void
  (e: 'close'): void
}>()

const menuRef = ref<HTMLElement | null>(null)

function onClickOutside(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  document.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside)
  document.removeEventListener('keydown', onKey)
})

function openRecipe() {
  if (props.entry.entry_type === 'recipe' && props.entry.recipe_id) {
    emit('open-recipe', props.entry.recipe_id)
    emit('close')
  }
}
</script>

<template>
  <div ref="menuRef" class="entry-actions-menu" role="menu" data-testid="entry-actions-menu">
    <button
      v-if="entry.entry_type === 'recipe' && entry.recipe_id"
      type="button"
      role="menuitem"
      class="menu-item"
      data-testid="entry-action-open"
      @click="openRecipe"
    >
      Open recipe
    </button>
    <button
      type="button"
      role="menuitem"
      class="menu-item"
      data-testid="entry-action-move-slot"
      @click="emit('move-to-slot'); emit('close')"
    >
      Move to another slot
    </button>
    <button
      type="button"
      role="menuitem"
      class="menu-item"
      data-testid="entry-action-move-shortlist"
      @click="emit('move-to-shortlist'); emit('close')"
    >
      Move to shortlist
    </button>
    <button
      type="button"
      role="menuitem"
      class="menu-item"
      data-testid="entry-action-save-shortlist"
      @click="emit('save-to-shortlist'); emit('close')"
    >
      Save to shortlist
    </button>
    <button
      type="button"
      role="menuitem"
      class="menu-item menu-item--danger"
      data-testid="entry-action-remove"
      @click="emit('remove'); emit('close')"
    >
      Remove from plan
    </button>
  </div>
</template>

<style scoped>
.entry-actions-menu {
  position: absolute;
  right: 0;
  top: 100%;
  min-width: 11rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 50;
  padding: 0.25rem 0;
  display: flex;
  flex-direction: column;
}
.menu-item {
  text-align: left;
  background: none;
  border: none;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
  color: #1f2937;
}
.menu-item:hover { background: #f3f4f6; }
.menu-item--danger { color: #dc2626; }
</style>
