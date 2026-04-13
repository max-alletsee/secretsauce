<!-- frontend/src/components/admin/AdminUserRow.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminUser, AdminUserUpdate, UserStats } from '@/types/admin'

const props = defineProps<{
  user: AdminUser
  isExpanded: boolean
  stats: UserStats | null
  statsLoading: boolean
}>()

const emit = defineEmits<{
  toggle: []
  update: [userId: string, data: AdminUserUpdate]
  delete: [userId: string]
}>()

const deleteState = ref<'idle' | 'confirm' | 'countdown'>('idle')
const countdown = ref(5)
let countdownTimer: ReturnType<typeof setInterval> | null = null

function startDeleteCountdown() {
  deleteState.value = 'countdown'
  countdown.value = 5
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer!)
      deleteState.value = 'confirm'
    }
  }, 1000)
}

function cancelDelete() {
  if (countdownTimer) clearInterval(countdownTimer)
  deleteState.value = 'idle'
  countdown.value = 5
}

function confirmDelete() {
  emit('delete', props.user.id)
  deleteState.value = 'idle'
}

// Reset delete state when row collapses
watch(() => props.isExpanded, (v) => {
  if (!v) cancelDelete()
})

const joinedDate = computed(() =>
  new Date(props.user.created_at).toISOString().slice(0, 10)
)
</script>

<template>
  <div class="user-row-wrapper">
    <div class="user-row" :class="{ inactive: !user.is_active }">
      <div class="col-email">
        <div>{{ user.email }}</div>
        <div v-if="user.display_name" class="display-name">{{ user.display_name }}</div>
      </div>
      <div class="col-status">
        <span :class="user.is_active ? 'badge-active' : 'badge-inactive'">
          {{ user.is_active ? 'Active' : 'Inactive' }}
        </span>
      </div>
      <div class="col-role">
        <span :class="user.is_superuser ? 'badge-super' : 'badge-user'">
          {{ user.is_superuser ? 'Superuser' : 'User' }}
        </span>
      </div>
      <div class="col-joined">{{ joinedDate }}</div>
      <div class="col-expand">
        <button class="expand-btn" @click="emit('toggle')">
          {{ isExpanded ? '▲' : '▼' }}
        </button>
      </div>
    </div>

    <div v-if="isExpanded" class="expanded-panel">
      <div v-if="statsLoading" class="stats-loading">Loading…</div>
      <div v-else-if="stats" class="stats">
        <span>Recipes: {{ stats.recipe_count }}</span>
        <span>Meal plans: {{ stats.meal_plan_count }}</span>
        <span v-if="stats.last_active">Last active: {{ stats.last_active.slice(0, 10) }}</span>
        <span v-else>Never active</span>
      </div>
      <div class="actions">
        <button
          class="btn-action btn-role"
          @click="emit('update', user.id, { is_superuser: !user.is_superuser })"
        >
          {{ user.is_superuser ? 'Demote from superuser' : 'Promote to superuser' }}
        </button>
        <button
          class="btn-action btn-status"
          @click="emit('update', user.id, { is_active: !user.is_active })"
        >
          {{ user.is_active ? 'Deactivate' : 'Activate' }}
        </button>
        <button
          v-if="deleteState === 'idle'"
          class="btn-action btn-delete"
          @click="startDeleteCountdown"
        >
          Delete account…
        </button>
        <button
          v-else-if="deleteState === 'countdown'"
          class="btn-action btn-delete btn-disabled"
          disabled
        >
          Confirm delete? ({{ countdown }})
        </button>
        <button
          v-else
          class="btn-action btn-delete btn-confirm"
          @click="confirmDelete"
        >
          Confirm delete
        </button>
        <button v-if="deleteState !== 'idle'" class="btn-action btn-cancel" @click="cancelDelete">
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 100px 50px;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #1e293b;
  align-items: center;
  font-size: 13px;
}
.user-row.inactive { opacity: 0.55; }
.display-name { font-size: 11px; color: #6b7280; }
.badge-active  { color: #4ade80; }
.badge-inactive { color: #f87171; }
.badge-super   { color: #f59e0b; }
.badge-user    { color: #6b7280; }
.col-joined    { color: #6b7280; font-size: 12px; }
.expand-btn    { background: none; border: none; color: #60a5fa; cursor: pointer; font-size: 13px; }
.expanded-panel {
  background: #0c1a2e;
  border-left: 3px solid #a78bfa;
  padding: 12px 16px;
  font-size: 12px;
}
.stats { display: flex; gap: 16px; color: #94a3b8; margin-bottom: 10px; flex-wrap: wrap; }
.stats-loading { color: #6b7280; margin-bottom: 10px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-action {
  border: none; border-radius: 4px; padding: 5px 10px; font-size: 11px;
  cursor: pointer; font-family: inherit;
}
.btn-role    { background: #1d4ed8; color: #fff; }
.btn-status  { background: #92400e; color: #fff; }
.btn-delete  { background: #7f1d1d; color: #fff; }
.btn-confirm { background: #dc2626; color: #fff; }
.btn-cancel  { background: #374151; color: #e5e7eb; }
.btn-disabled { opacity: 0.6; cursor: not-allowed; }
</style>
