<!-- frontend/src/App.vue -->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/useUserStore'
import ToastHost from '@/components/ToastHost.vue'

const userStore = useUserStore()
const router = useRouter()

const primaryLinks = [
  { to: '/recipes', label: 'Recipes', icon: '🍳' },
  { to: '/meal-plan', label: 'Meal Plan', icon: '📅' },
  { to: '/shopping-lists', label: 'Shopping Lists', icon: '🛒' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

async function handleLogout() {
  await userStore.logout()
  router.push('/login')
}
</script>

<template>
  <template v-if="userStore.isAuthenticated">
    <!-- Top bar (primary links on desktop; secondary actions always) -->
    <nav class="app-nav">
      <div class="app-nav__links">
        <RouterLink v-for="link in primaryLinks" :key="link.to" :to="link.to">
          {{ link.label }}
        </RouterLink>
      </div>
      <div class="app-nav__secondary">
        <RouterLink v-if="userStore.isSuperuser" to="/admin">Admin</RouterLink>
        <button data-testid="logout" class="app-nav__logout" @click="handleLogout">
          Log out
        </button>
      </div>
    </nav>

    <main class="app-main">
      <RouterView />
    </main>

    <!-- Bottom tab bar (mobile only via CSS) -->
    <nav class="bottom-nav" data-testid="bottom-nav">
      <RouterLink
        v-for="link in primaryLinks"
        :key="link.to"
        :to="link.to"
        class="bottom-nav__item"
      >
        <span class="bottom-nav__icon">{{ link.icon }}</span>
        <span class="bottom-nav__label">{{ link.label }}</span>
      </RouterLink>
    </nav>
  </template>
  <template v-else>
    <RouterView />
  </template>
  <ToastHost />
</template>

<style scoped>
.app-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #1e293b;
  color: white;
}
.app-nav__links {
  display: flex;
  gap: 1.5rem;
}
.app-nav__secondary {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.app-nav__links a,
.app-nav__secondary a {
  color: #cbd5e1;
  text-decoration: none;
  font-size: 0.9375rem;
}
.app-nav__links a.router-link-active,
.app-nav__secondary a.router-link-active {
  color: white;
  font-weight: 600;
}
.app-nav__logout {
  background: none;
  border: 1px solid #475569;
  color: #cbd5e1;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.app-nav__logout:hover {
  border-color: #94a3b8;
  color: white;
}
.app-main {
  min-height: 0;
}

/* Bottom tab bar */
.bottom-nav {
  display: none;
}
.bottom-nav__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.4rem 0;
  color: #64748b;
  text-decoration: none;
  font-size: 0.6875rem;
}
.bottom-nav__item.router-link-active {
  color: #2563eb;
}
.bottom-nav__icon {
  font-size: 1.1rem;
  line-height: 1;
}

/* Mobile: hide top primary links, show bottom tab bar */
@media (max-width: 767px) {
  .app-nav__links {
    display: none;
  }
  .app-main {
    padding-bottom: 4rem;
  }
  .bottom-nav {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: white;
    border-top: 1px solid #e5e7eb;
    z-index: 50;
  }
}
</style>
