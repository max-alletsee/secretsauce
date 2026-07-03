<script setup lang="ts">
defineProps<{
  title: string
  body?: string
}>()
</script>

<template>
  <div class="empty-state">
    <div v-if="$slots.illustration" class="empty-state__illustration">
      <slot name="illustration" />
    </div>
    <h2 class="empty-state__title">{{ title }}</h2>
    <p v-if="body" class="empty-state__body">{{ body }}</p>
    <div v-if="$slots.default" class="empty-state__body">
      <slot />
    </div>
    <div v-if="$slots.action" class="empty-state__action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--space-4);
  padding: var(--space-8) var(--space-4);
}

.empty-state__illustration {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.empty-state__title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.empty-state__body {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
  max-width: 32ch;
}

.empty-state__action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}
</style>
