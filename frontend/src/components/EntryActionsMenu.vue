<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { TimelineEntry } from '@/types/timeline'

const props = defineProps<{
  entry: TimelineEntry
  recipeTitle?: string
  /**
   * Viewport-relative coordinates of the menu's top-right corner, taken from
   * the trigger button's getBoundingClientRect(). Required because the menu
   * is teleported to <body> (see template) so it can never be trapped behind
   * a sibling meal slot's stacking context (e.g. past-day rows apply
   * `filter`, which promotes each slot into its own stacking context and
   * defeats ancestor-relative `position: absolute` + z-index).
   */
  anchor: { top: number; right: number }
}>()

const emit = defineEmits<{
  (e: 'open-recipe', recipeId: string): void
  (e: 'move-to-slot'): void
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
  <Teleport to="body">
  <div
    ref="menuRef"
    class="entry-actions-menu"
    role="menu"
    data-testid="entry-actions-menu"
    :style="{ top: `${anchor.top}px`, right: `${anchor.right}px` }"
  >
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
  </Teleport>
</template>

<style scoped>
.entry-actions-menu {
  position: fixed;
  min-width: 11rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: var(--shadow);
  z-index: 120;
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
  color: var(--color-text);
}
.menu-item:hover { background: var(--color-surface-2); }
.menu-item--danger { color: var(--color-danger); }
</style>
