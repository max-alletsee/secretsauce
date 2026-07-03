<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    width?: string
    height?: string
    radius?: string
  }>(),
  {
    width: '100%',
    height: '1rem',
    radius: 'var(--radius-sm)',
  },
)

const style = computed(() => ({
  width: props.width,
  height: props.height,
  borderRadius: props.radius,
}))
</script>

<template>
  <div class="skeleton" :style="style" aria-hidden="true" />
</template>

<style scoped>
.skeleton {
  background: var(--color-surface-2);
  background-image: linear-gradient(
    90deg,
    var(--color-surface-2) 0%,
    var(--color-surface) 40%,
    var(--color-surface-2) 80%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* prefers-reduced-motion: main.css kills animations globally with !important,
   so the shimmer animation will already be suppressed. We declare a static
   fallback here to be explicit and ensure correct appearance in all environments. */
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    background: var(--color-surface-2);
    animation: none;
  }
}
</style>
