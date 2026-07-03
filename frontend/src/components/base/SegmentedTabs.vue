<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  modelValue: string
  tabs: { value: string; label: string }[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const tablistRef = ref<HTMLElement | null>(null)

const activeIndex = computed(() => props.tabs.findIndex((t) => t.value === props.modelValue))

function selectTab(value: string) {
  if (value !== props.modelValue) {
    emit('update:modelValue', value)
  }
}

function handleKeydown(event: KeyboardEvent) {
  const total = props.tabs.length
  if (total === 0) return

  let nextIndex: number | null = null

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (activeIndex.value + 1) % total
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (activeIndex.value - 1 + total) % total
  }

  if (nextIndex !== null) {
    event.preventDefault()
    const nextTab = props.tabs[nextIndex]
    if (!nextTab) return
    emit('update:modelValue', nextTab.value)
    // Move focus to the newly selected tab button via template ref
    const tabEls = tablistRef.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabEls?.[nextIndex]?.focus()
  }
}
</script>

<template>
  <div ref="tablistRef" class="segmented-tabs" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      role="tab"
      type="button"
      :aria-selected="tab.value === modelValue ? 'true' : 'false'"
      :tabindex="tab.value === modelValue ? 0 : -1"
      :class="['segmented-tabs__tab', { 'segmented-tabs__tab--active': tab.value === modelValue }]"
      @click="selectTab(tab.value)"
      @keydown="handleKeydown"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented-tabs {
  display: inline-flex;
  align-items: center;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-1);
  gap: var(--space-1);
}

.segmented-tabs__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1) var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1.5;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.segmented-tabs__tab:hover:not(.segmented-tabs__tab--active) {
  background: var(--color-surface);
}

.segmented-tabs__tab--active {
  background: var(--color-primary);
  color: var(--color-primary-ink);
}

.segmented-tabs__tab--active:hover {
  filter: brightness(0.92);
}

.segmented-tabs__tab:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
