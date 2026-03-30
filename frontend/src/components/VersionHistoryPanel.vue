<!-- frontend/src/components/VersionHistoryPanel.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import type { RecipeVersion } from '@/types/recipe'

defineProps<{
  versions: RecipeVersion[]
  currentVersionNumber: number
}>()

const emit = defineEmits<{
  restore: [versionId: string]
}>()

const expanded = ref(false)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <section class="version-panel">
    <button type="button" class="version-panel__toggle" @click="expanded = !expanded">
      Version history ({{ versions.length }})
      <span class="version-panel__arrow" :class="{ 'version-panel__arrow--open': expanded }">
        &#9662;
      </span>
    </button>

    <ul v-if="expanded" class="version-panel__list">
      <li v-for="version in versions" :key="version.id" class="version-panel__item">
        <div class="version-panel__info">
          <strong>v{{ version.version_number }}</strong>
          <span class="version-panel__date">{{ formatDate(version.created_at) }}</span>
          <span class="version-panel__title">{{ version.title }}</span>
        </div>
        <button
          v-if="version.version_number !== currentVersionNumber"
          type="button"
          class="version-panel__restore"
          @click="emit('restore', version.id)"
        >
          Restore
        </button>
        <span v-else class="version-panel__current">current</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.version-panel {
  border-top: 1px solid #e5e7eb;
  padding-top: 1rem;
}
.version-panel__toggle {
  background: none;
  border: none;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #374151;
  padding: 0;
}
.version-panel__arrow { transition: transform 0.15s; }
.version-panel__arrow--open { transform: rotate(180deg); }
.version-panel__list {
  list-style: none;
  padding: 0;
  margin: 0.75rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.version-panel__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f3f4f6;
}
.version-panel__info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.875rem;
}
.version-panel__date { color: #6b7280; }
.version-panel__title { color: #9ca3af; }
.version-panel__restore {
  background: none;
  border: 1px solid #2563eb;
  color: #2563eb;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  cursor: pointer;
}
.version-panel__current {
  font-size: 0.8125rem;
  color: #9ca3af;
}
</style>
