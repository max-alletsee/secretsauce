<!-- frontend/src/components/SortControl.vue -->
<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  popularityAvailable: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="sort-control">
    <label class="sort-control__label" for="sort-select">Sort by</label>
    <select
      id="sort-select"
      :value="props.modelValue"
      class="sort-control__select"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="created_at_desc">Newest first</option>
      <option value="created_at_asc">Oldest first</option>
      <option value="title_asc">Title A–Z</option>
      <option value="total_time_asc">Quickest</option>
      <option
        value="popularity"
        :disabled="!props.popularityAvailable"
        :title="!props.popularityAvailable ? 'Available after meal planning' : undefined"
      >
        Most popular
      </option>
    </select>
  </div>
</template>

<style scoped>
.sort-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.sort-control__label {
  font-size: 0.875rem;
  color: #6b7280;
  white-space: nowrap;
}
.sort-control__select {
  padding: 0.375rem 0.625rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background: white;
  cursor: pointer;
}
</style>
