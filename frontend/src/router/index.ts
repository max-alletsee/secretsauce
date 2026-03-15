// frontend/src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/useUserStore'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/recipes',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresGuest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { requiresGuest: true },
    },
    {
      // Placeholder — replaced with RecipeListView in Phase 2
      path: '/recipes',
      name: 'recipes',
      component: HomeView,
      meta: { requiresAuth: true },
    },
    {
      // Placeholder — replaced with AdminView in Phase 8
      path: '/admin',
      name: 'admin',
      component: HomeView,
      meta: { requiresAuth: true, requiresSuperuser: true },
    },
  ],
})

router.beforeEach((to) => {
  const userStore = useUserStore()

  if (to.meta.requiresGuest && userStore.isAuthenticated) {
    return { name: 'recipes' }
  }

  if (to.meta.requiresAuth && !userStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresSuperuser && !userStore.isSuperuser) {
    return { name: 'recipes' }
  }
})

export default router
