<script setup lang="ts">
defineProps<{
  dotOnly?: boolean
}>()
</script>

<template>
  <span class="wordmark" aria-label="secretsauce">
    <span class="wordmark__dot" aria-hidden="true" />
    <span v-if="!dotOnly" class="wordmark__text" aria-hidden="true">secretsauce</span>
  </span>
</template>

<style scoped>
.wordmark {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  line-height: 1;
}

.wordmark__dot {
  display: inline-block;
  width: 0.75em;
  height: 0.75em;
  border-radius: 50%;
  background: var(--color-primary);
  flex-shrink: 0;
}

.wordmark__text {
  font-family: var(--font-display);
  font-size: inherit;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.02em;
  line-height: 1;
}
</style>
