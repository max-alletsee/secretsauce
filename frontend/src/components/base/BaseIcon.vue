<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'

const props = withDefaults(
  defineProps<{ icon: Component; size?: 16 | 20 | 24; label?: string }>(),
  { size: 20 },
)

const a11y = computed(() =>
  props.label
    ? { role: 'img', 'aria-label': props.label }
    : { 'aria-hidden': 'true' },
)
</script>

<template>
  <component :is="icon" :size="size" v-bind="a11y" />
</template>

<style scoped>
</style>
