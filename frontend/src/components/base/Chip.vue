<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'accent' | 'neutral'
  }>(),
  {
    tone: 'accent',
  },
)
</script>

<template>
  <span :class="['chip', `chip--${tone}`]">
    <slot />
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
}

.chip--accent {
  background: var(--color-accent-soft);
  color: var(--color-text);
}

.chip--neutral {
  background: var(--color-surface-2);
  color: var(--color-text);
}
</style>
