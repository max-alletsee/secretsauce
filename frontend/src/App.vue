<!-- frontend/src/App.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/useUserStore'
import ToastHost from '@/components/ToastHost.vue'
import Wordmark from '@/components/base/Wordmark.vue'
import UserMenu from '@/components/base/UserMenu.vue'
import TabBar from '@/components/base/TabBar.vue'
import { UtensilsCrossed, CalendarDays, ShoppingCart } from '@lucide/vue'

const userStore = useUserStore()
const router = useRouter()

const primaryLinks = [
  { to: '/recipes', label: 'Recipes', icon: UtensilsCrossed },
  { to: '/meal-plan', label: 'Meal Plan', icon: CalendarDays },
  { to: '/shopping-lists', label: 'Shopping Lists', icon: ShoppingCart },
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
        <RouterLink v-for="link in primaryLinks" :key="link.to" :to="link.to">
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

    <!-- Bottom tab bar (mobile only via CSS).
         Account deliberately lives only in the top bar on mobile: its menu
         expands downward and would run off the bottom of the screen in a PWA. -->
    <nav class="bottom-nav" data-testid="bottom-nav">
      <TabBar :items="primaryLinks" class="bottom-nav__tabs" />
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
.bottom-nav__tabs {
  flex: 1;
  /* TabBar already supplies its own background/border/safe-area padding;
     strip those so the surrounding .bottom-nav row owns them once. */
  border-top: none;
  padding-bottom: 0;
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
    align-items: stretch;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
    padding-bottom: env(safe-area-inset-bottom, 0);
    z-index: 50;
  }
}
</style>
