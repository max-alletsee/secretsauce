// frontend/src/stores/useUserStore.ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authApi from '@/api/auth'
import type { LoginCredentials, RegisterData, User, UserUpdatePayload } from '@/types/user'

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const isAuthenticated = ref(false)
  const isSuperuser = computed(() => user.value?.is_superuser ?? false)

  function _setTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('refresh_token', refreshToken)
  }

  function _clearTokens() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  }

  async function _fetchProfile() {
    const { data } = await authApi.getMe()
    user.value = data
    isAuthenticated.value = true
  }

  async function login(credentials: LoginCredentials) {
    const { data } = await authApi.login(credentials)
    _setTokens(data.access_token, data.refresh_token)
    await _fetchProfile()
  }

  async function register(data: RegisterData) {
    await authApi.register(data)
    await login({ email: data.email, password: data.password })
  }

  async function logout() {
    try {
      await authApi.logout()
    } catch {
      // Ignore errors — token may already be invalid
    } finally {
      _clearTokens()
      user.value = null
      isAuthenticated.value = false
    }
  }

  async function refreshAccessToken(): Promise<boolean> {
    const token = localStorage.getItem('refresh_token')
    if (!token) return false
    try {
      const { data } = await authApi.refreshToken(token)
      _setTokens(data.access_token, data.refresh_token)
      return true
    } catch {
      _clearTokens()
      return false
    }
  }

  async function updateProfile(payload: UserUpdatePayload) {
    const { data } = await authApi.updateMe(payload)
    user.value = data
  }

  /** Restore auth state from localStorage on app startup. */
  async function initFromStorage() {
    const token = localStorage.getItem('access_token')
    if (!token) return
    try {
      await _fetchProfile()
    } catch {
      _clearTokens()
      user.value = null
      isAuthenticated.value = false
    }
  }

  return {
    user,
    isAuthenticated,
    isSuperuser,
    login,
    register,
    logout,
    refreshAccessToken,
    updateProfile,
    initFromStorage,
  }
})
