import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      // meta.requiresAuth = true added in Phase 1
    },
  ],
})

// Auth guard skeleton — activated in Phase 1
// router.beforeEach((to) => { ... })

export default router
