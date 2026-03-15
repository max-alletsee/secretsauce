<!-- frontend/src/views/RegisterView.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/useUserStore'

const router = useRouter()
const userStore = useUserStore()

const email = ref('')
const password = ref('')
const displayName = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await userStore.register({
      email: email.value,
      password: password.value,
      display_name: displayName.value || undefined,
    })
    router.push('/recipes')
  } catch (err: any) {
    error.value = err?.response?.data?.detail ?? 'Registration failed. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <div class="auth-card">
      <h1>Create account</h1>
      <form @submit.prevent="submit" novalidate>
        <label for="display-name">Name (optional)</label>
        <input
          id="display-name"
          v-model="displayName"
          type="text"
          autocomplete="name"
          :disabled="loading"
        />
        <label for="email">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          :disabled="loading"
        />
        <label for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          required
          :disabled="loading"
        />
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button type="submit" :disabled="loading">
          {{ loading ? 'Creating account…' : 'Create account' }}
        </button>
      </form>
      <p class="switch-link">
        Already have an account? <RouterLink to="/login">Sign in</RouterLink>
      </p>
    </div>
  </main>
</template>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 1rem;
}

.auth-card {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

label {
  font-size: 0.875rem;
  font-weight: 500;
}

input {
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
}

button {
  margin-top: 0.5rem;
  padding: 0.625rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 1rem;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #dc2626;
  font-size: 0.875rem;
}

.switch-link {
  font-size: 0.875rem;
  text-align: center;
}
</style>
