<script setup lang="ts">
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'
import BaseIcon from './BaseIcon.vue'

defineProps<{
  items: { to: string; label: string; icon: Component }[]
}>()
</script>

<template>
  <nav class="tab-bar">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="tab-bar__item"
    >
      <BaseIcon :icon="item.icon" :size="24" />
      <span class="tab-bar__label">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  /* Separates adjacent tap targets so a near-miss lands on nothing rather
     than on the neighbouring tab. */
  gap: var(--space-4);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  /* Inset from the screen edges so the first/last labels aren't clipped,
     and clear the safe area on notched phones (all sides — left/right
     matter in landscape). */
  padding-inline: calc(var(--space-4) + env(safe-area-inset-left, 0))
    calc(var(--space-4) + env(safe-area-inset-right, 0));
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.tab-bar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-1);
  color: var(--color-text-muted);
  text-decoration: none;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 500;
  line-height: 1;
  transition: color 0.15s ease;
}

.tab-bar__item:hover {
  color: var(--color-text);
}

/* Vue Router sets this class automatically on the active link */
.tab-bar__item.router-link-active {
  color: var(--color-primary);
}

.tab-bar__label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 100% rather than a fixed cap: the flex item is already width-limited, and
     "Shopping Lists" measures right at the old 80px cap, so a slightly wider
     font or a narrower phone would have truncated it. */
  max-width: 100%;
}
</style>
