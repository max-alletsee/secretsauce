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
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  /* Safe area for notched phones */
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.tab-bar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  flex: 1;
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
  max-width: 80px;
}
</style>
