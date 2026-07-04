<!-- frontend/src/App.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/useUserStore'
import ToastHost from '@/components/ToastHost.vue'
import BaseIcon from '@/components/base/BaseIcon.vue'
import Wordmark from '@/components/base/Wordmark.vue'
import UserMenu from '@/components/base/UserMenu.vue'
import { UtensilsCrossed, CalendarDays, ShoppingCart, Settings } from '@lucide/vue'

const userStore = useUserStore()
const router = useRouter()

const primaryLinks = [
  { to: '/recipes', label: 'Recipes', icon: UtensilsCrossed },
  { to: '/meal-plan', label: 'Meal Plan', icon: CalendarDays },
  { to: '/shopping-lists', label: 'Shopping Lists', icon: ShoppingCart },
  { to: '/settings', label: 'Settings', icon: Settings },
]

async function handleLogout() {
  await userStore.logout()
  router.push('/login')
}

const userMenuItems = computed(() => {
  const items: { label: string; onClick?: () => void; to?: string; testid?: string }[] = [
    { label: 'Settings', to: '/settings' },
  ]
  if (userStore.isSuperuser) {
    items.push({ label: 'Admin', to: '/admin' })
  }
  items.push({ label: 'Log out', onClick: handleLogout, testid: 'logout' })
  return items
})
</script>

<template>
  <template v-if="userStore.isAuthenticated">
    <!-- Top bar (desktop only via CSS) -->
    <nav class="app-nav">
      <RouterLink to="/recipes" class="app-nav__brand">
        <Wordmark />
      </RouterLink>
      <div class="app-nav__links">
        <RouterLink v-for="link in primaryLinks.slice(0, 3)" :key="link.to" :to="link.to">
          {{ link.label }}
        </RouterLink>
      </div>
      <div class="app-nav__secondary">
        <UserMenu :items="userMenuItems" />
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
        <span class="bottom-nav__icon"><BaseIcon :icon="link.icon" /></span>
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
  gap: var(--space-6);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
}
.app-nav__brand {
  display: inline-flex;
  align-items: center;
  font-size: var(--text-lg);
  text-decoration: none;
}
.app-nav__links {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  margin-right: auto;
}
.app-nav__secondary {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.app-nav__links a {
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: var(--text-sm);
}
.app-nav__links a.router-link-active {
  color: var(--color-primary);
  font-weight: 600;
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
