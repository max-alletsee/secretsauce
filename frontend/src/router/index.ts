// frontend/src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/useUserStore'

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
      path: '/recipes',
      name: 'recipes',
      component: () => import('@/views/RecipeListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/recipes/new',
      name: 'recipe-create',
      component: () => import('@/views/RecipeCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/recipes/:id',
      name: 'recipe-detail',
      component: () => import('@/views/RecipeDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/recipes/:id/edit',
      name: 'recipe-edit',
      component: () => import('@/views/RecipeEditView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/meal-plans',
      name: 'meal-plans',
      component: () => import('@/views/MealPlanListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/meal-plans/new',
      name: 'meal-plan-create',
      component: () => import('@/views/MealPlanCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/meal-plans/:id',
      name: 'meal-plan-detail',
      component: () => import('@/views/MealPlanDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/meal-plans/:id/log',
      name: 'meal-plan-log',
      component: () => import('@/views/MealPlanLogView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/shopping-lists/:mealPlanId',
      name: 'shopping-list',
      component: () => import('@/views/ShoppingListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/HomeView.vue'),
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
