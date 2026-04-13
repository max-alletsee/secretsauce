<!-- frontend/src/components/admin/LogFilterBar.vue -->
<script setup lang="ts">
defineProps<{ loading?: boolean }>()
defineEmits<{ refresh: [] }>()
</script>

<template>
  <div class="filter-bar">
    <slot />
    <button class="refresh-btn" :disabled="loading" @click="$emit('refresh')">
      Refresh
    </button>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px;
}
.refresh-btn {
  margin-left: auto; background: #1f2937; border: 1px solid #374151;
  border-radius: 4px; padding: 5px 10px; color: #9ca3af; font-size: 12px; cursor: pointer;
}
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
