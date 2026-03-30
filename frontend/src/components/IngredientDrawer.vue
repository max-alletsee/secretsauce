<!-- frontend/src/components/IngredientDrawer.vue -->
<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import type { Ingredient } from '@/types/recipe'

const props = defineProps<{
  ingredient: Ingredient | null
}>()

const emit = defineEmits<{
  save: [ingredient: Ingredient]
  delete: []
  close: []
}>()

const COMMON_UNITS = [
  'g', 'kg', 'ml', 'l', 'cup', 'tbsp', 'tsp', 'oz', 'lb',
  'piece', 'slice', 'bunch', 'clove', 'can', 'package', 'pinch', 'dash', 'whole',
]

const name = ref('')
const quantity = ref('')
const unit = ref('')
const useCustomUnit = ref(false)
const customUnit = ref('')

watchEffect(() => {
  const ing = props.ingredient
  name.value = ing?.name ?? ''
  quantity.value = ing?.quantity ?? ''
  const u = ing?.unit ?? ''
  if (u && !COMMON_UNITS.includes(u)) {
    useCustomUnit.value = true
    customUnit.value = u
    unit.value = ''
  } else {
    useCustomUnit.value = false
    customUnit.value = ''
    unit.value = u
  }
})

function save() {
  if (!name.value.trim()) return
  const finalUnit = useCustomUnit.value ? customUnit.value.trim() : unit.value
  emit('save', {
    name: name.value.trim(),
    quantity: quantity.value.trim(),
    unit: finalUnit || null,
  })
}
</script>

<template>
  <div class="drawer-backdrop" @click.self="emit('close')">
    <div class="drawer">
      <h3 class="drawer__title">{{ ingredient ? 'Edit ingredient' : 'Add ingredient' }}</h3>

      <label for="ing-name">Name</label>
      <input id="ing-name" v-model="name" type="text" placeholder="e.g. spaghetti" />

      <label for="ing-qty">Quantity</label>
      <input id="ing-qty" v-model="quantity" type="text" placeholder="e.g. 400" />

      <label for="ing-unit">Unit</label>
      <div v-if="!useCustomUnit">
        <select id="ing-unit" v-model="unit">
          <option value="">None</option>
          <option v-for="u in COMMON_UNITS" :key="u" :value="u">{{ u }}</option>
        </select>
        <button type="button" class="link-btn" @click="useCustomUnit = true">Other unit</button>
      </div>
      <div v-else>
        <input id="ing-unit" v-model="customUnit" type="text" placeholder="Custom unit" />
        <button type="button" class="link-btn" @click="useCustomUnit = false">Use list</button>
      </div>

      <div class="drawer__actions">
        <button type="button" class="btn btn--primary" @click="save" :disabled="!name.trim()">
          Save
        </button>
        <button v-if="ingredient" type="button" class="btn btn--danger" @click="emit('delete')">
          Delete
        </button>
        <button type="button" class="btn btn--secondary" @click="emit('close')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 100;
  display: flex;
  align-items: flex-end;
}
.drawer {
  width: 100%;
  background: white;
  border-radius: 1rem 1rem 0 0;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 80vh;
  overflow-y: auto;
}
.drawer__title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
}
label {
  font-size: 0.875rem;
  font-weight: 500;
}
input, select {
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
  width: 100%;
  box-sizing: border-box;
}
.link-btn {
  background: none;
  border: none;
  color: #2563eb;
  font-size: 0.8125rem;
  cursor: pointer;
  padding: 0.25rem 0;
}
.drawer__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.btn {
  flex: 1;
  padding: 0.625rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 1rem;
  cursor: pointer;
}
.btn--primary { background: #2563eb; color: white; }
.btn--primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn--danger { background: #dc2626; color: white; }
.btn--secondary { background: #f3f4f6; color: #374151; }
</style>
