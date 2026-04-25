<!-- frontend/src/App.vue -->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/useUserStore'

const userStore = useUserStore()
const router = useRouter()

async function handleLogout() {
  await userStore.logout()
  router.push('/login')
}
</script>

<template>
  <nav v-if="userStore.isAuthenticated" class="app-nav">
    <div class="app-nav__links">
      <RouterLink to="/recipes">Recipes</RouterLink>
      <RouterLink to="/meal-plan">Meal Plan</RouterLink>
      <RouterLink v-if="userStore.isSuperuser" to="/admin">Admin</RouterLink>
    </div>
    <button data-testid="logout" class="app-nav__logout" @click="handleLogout">
      Log out
    </button>
  </nav>
  <RouterView />
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
.app-nav__links a {
  color: #cbd5e1;
  text-decoration: none;
  font-size: 0.9375rem;
}
.app-nav__links a.router-link-active {
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
</style>
