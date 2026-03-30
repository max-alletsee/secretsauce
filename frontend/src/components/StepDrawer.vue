<!-- frontend/src/components/StepDrawer.vue -->
<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import type { Step } from '@/types/recipe'

const props = defineProps<{
  step: Step | null
  stepNumber: number
}>()

const emit = defineEmits<{
  save: [step: Step]
  delete: []
  close: []
}>()

const instruction = ref('')

watchEffect(() => {
  instruction.value = props.step?.instruction ?? ''
})

function save() {
  if (!instruction.value.trim()) return
  emit('save', {
    order: props.stepNumber,
    instruction: instruction.value.trim(),
  })
}
</script>

<template>
  <div class="drawer-backdrop" @click.self="emit('close')">
    <div class="drawer">
      <h3 class="drawer__title">Step {{ stepNumber }}</h3>

      <label for="step-instruction">Instruction</label>
      <textarea
        id="step-instruction"
        v-model="instruction"
        rows="4"
        placeholder="Describe this step..."
      ></textarea>

      <div class="drawer__actions">
        <button type="button" class="btn btn--primary" @click="save" :disabled="!instruction.trim()">
          Save
        </button>
        <button v-if="step" type="button" class="btn btn--danger" @click="emit('delete')">
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
label { font-size: 0.875rem; font-weight: 500; }
textarea {
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
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
