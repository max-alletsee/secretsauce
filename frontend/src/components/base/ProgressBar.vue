<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  value: number
  max: number
  label?: string
}>()

const fillPercent = computed(() => {
  if (props.max <= 0) return 0
  const pct = (props.value / props.max) * 100
  return Math.min(100, Math.max(0, pct))
})
</script>

<template>
  <div class="progress-bar">
    <span v-if="label" class="progress-bar__label">{{ label }}</span>
    <div
      class="progress-bar__track"
      role="progressbar"
      :aria-valuenow="value"
      aria-valuemin="0"
      :aria-valuemax="max"
    >
      <div
        class="progress-bar__fill"
        :style="{ width: `${fillPercent}%` }"
      />
    </div>
  </div>
</template>

<style scoped>
.progress-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.progress-bar__label {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.progress-bar__track {
  width: 100%;
  height: 6px;
  background: var(--color-surface-2);
  border-radius: var(--radius-pill);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.progress-bar__fill {
  height: 100%;
  background: var(--color-success);
  border-radius: var(--radius-pill);
  transition: width 0.2s ease;
}
</style>
