import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  // Skeleton — full implementation in Phase 1
  const isAuthenticated = ref(false)
  const isSuperuser = ref(false)

  return { isAuthenticated, isSuperuser }
})
