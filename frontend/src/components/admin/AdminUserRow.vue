<!-- frontend/src/components/admin/AdminUserRow.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminUser, AdminUserUpdate, UserStats } from '@/types/admin'
import BaseIcon from '@/components/base/BaseIcon.vue'
import PourLoader from '@/components/base/PourLoader.vue'
import { ChevronUp, ChevronDown } from '@lucide/vue'

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
        <span class="col-label">Status</span>
        <span :class="user.is_active ? 'badge-active' : 'badge-inactive'">
          {{ user.is_active ? 'Active' : 'Inactive' }}
        </span>
      </div>
      <div class="col-role">
        <span class="col-label">Role</span>
        <span :class="user.is_superuser ? 'badge-super' : 'badge-user'">
          {{ user.is_superuser ? 'Superuser' : 'User' }}
        </span>
      </div>
      <div class="col-joined">
        <span class="col-label">Joined</span>
        <span>{{ joinedDate }}</span>
      </div>
      <div class="col-expand">
        <button class="expand-btn" :aria-label="isExpanded ? 'Collapse user details' : 'Expand user details'" @click="emit('toggle')">
          <BaseIcon :icon="isExpanded ? ChevronUp : ChevronDown" />
        </button>
      </div>
    </div>

    <div v-if="isExpanded" class="expanded-panel">
      <div v-if="statsLoading" class="stats-loading"><PourLoader size="sm" /></div>
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
  border-bottom: 1px solid var(--color-border);
  align-items: center;
  font-size: 13px;
}
.user-row.inactive { opacity: 0.55; }
.display-name { font-size: 11px; color: var(--color-text-muted); }
.badge-active  { color: var(--color-success); }
.badge-inactive { color: var(--color-danger); }
.badge-super   { color: var(--color-warning); }
.badge-user    { color: var(--color-text-muted); }
.col-joined    { color: var(--color-text-muted); font-size: 12px; }
.expand-btn    { background: none; border: none; color: var(--color-accent); cursor: pointer; font-size: 13px; }
.col-label { display: none; }

/* Stacked card-per-row layout at narrow widths: no horizontal scroll needed. */
@media (max-width: 767px) {
  .user-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-1) var(--space-3);
    padding: var(--space-3);
    position: relative;
  }
  .col-email {
    flex: 1 1 100%;
    padding-right: 32px; /* keep clear of the absolutely-positioned expand button */
  }
  .col-status, .col-role, .col-joined {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
  }
  .col-label {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
  }
  .col-expand {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
  }
}
.expanded-panel {
  background: var(--color-bg);
  border-left: 3px solid var(--color-primary);
  padding: 12px 16px;
  font-size: 12px;
}
.stats { display: flex; gap: 16px; color: var(--color-text-muted); margin-bottom: 10px; flex-wrap: wrap; }
.stats-loading { color: var(--color-text-muted); margin-bottom: 10px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-action {
  border: none; border-radius: var(--radius-sm); padding: 5px 10px; font-size: 11px;
  cursor: pointer; font-family: inherit;
}
.btn-role    { background: var(--color-accent); color: var(--color-primary-ink); }
.btn-status  { background: var(--color-warning); color: var(--color-primary-ink); }
.btn-delete  { background: var(--color-danger-soft); color: var(--color-text); }
.btn-confirm { background: var(--color-danger); color: var(--color-primary-ink); }
.btn-cancel  { background: var(--color-border); color: var(--color-text); }
.btn-disabled { opacity: 0.6; cursor: not-allowed; }
</style>
