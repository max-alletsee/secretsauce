<!-- frontend/src/components/SearchBar.vue -->
<script setup lang="ts">
const model = defineModel<string>({ default: '' })
</script>

<template>
  <div class="search-bar">
    <input
      v-model="model"
      type="search"
      placeholder="Search recipes…"
      aria-label="Search recipes"
      class="search-bar__input"
    />
    <button
      v-if="model"
      data-testid="search-clear"
      type="button"
      class="search-bar__clear"
      aria-label="Clear search"
      @click="model = ''"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.search-bar {
  position: relative;
  display: flex;
  align-items: center;
}
.search-bar__input {
  width: 100%;
  padding: 0.5rem 2.5rem 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}
.search-bar__input:focus {
  outline: 2px solid #2563eb;
  outline-offset: -1px;
}
.search-bar__clear {
  position: absolute;
  right: 0.5rem;
  background: none;
  border: none;
  font-size: 1.25rem;
  color: #6b7280;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}
</style>
