<script setup lang="ts">
import { computed } from 'vue'
import { CircleUser } from '@lucide/vue'
import BaseIcon from './BaseIcon.vue'

const props = defineProps<{
  name?: string
}>()

/** First letters of up to 2 words, uppercased. Returns empty string when name is absent/blank. */
const initials = computed(() => {
  const trimmed = (props.name ?? '').trim()
  if (!trimmed) return ''
  const words = trimmed.split(/\s+/)
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
})

const showInitials = computed(() => initials.value.length > 0)
</script>

<template>
  <span class="avatar" aria-hidden="true">
    <span v-if="showInitials" class="avatar__initials">{{ initials }}</span>
    <BaseIcon v-else :icon="CircleUser" :size="24" />
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  flex-shrink: 0;
  overflow: hidden;
}

.avatar__initials {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.03em;
  user-select: none;
}
</style>
