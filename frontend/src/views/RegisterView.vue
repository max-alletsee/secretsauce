<!-- frontend/src/views/RegisterView.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { isAxiosError } from 'axios'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/useUserStore'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import Wordmark from '@/components/base/Wordmark.vue'

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
  } catch (err: unknown) {
    const detail = isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined
    error.value = detail ?? 'Registration failed. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <BaseCard class="auth-card">
      <div class="auth-brand">
        <Wordmark />
      </div>
      <h1>Create account</h1>
      <form class="auth-form" @submit.prevent="submit" novalidate>
        <BaseInput
          id="display-name"
          v-model="displayName"
          label="Name (optional)"
          type="text"
          autocomplete="name"
          :disabled="loading"
        />
        <BaseInput
          id="email"
          v-model="email"
          label="Email"
          type="email"
          autocomplete="email"
          required
          :disabled="loading"
        />
        <BaseInput
          id="password"
          v-model="password"
          label="Password"
          type="password"
          autocomplete="new-password"
          required
          :disabled="loading"
        />
        <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
        <BaseButton type="submit" variant="primary" :loading="loading" :disabled="loading">
          {{ loading ? 'Creating account…' : 'Create account' }}
        </BaseButton>
      </form>
      <p class="switch-link">
        Already have an account? <RouterLink to="/login">Sign in</RouterLink>
      </p>
    </BaseCard>
  </main>
</template>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: var(--space-4);
  background: var(--color-bg);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.auth-brand {
  display: flex;
  justify-content: center;
  font-size: var(--text-lg);
}

h1 {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 600;
  text-align: center;
  color: var(--color-text);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.auth-error {
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.switch-link {
  font-size: var(--text-sm);
  text-align: center;
  color: var(--color-text);
}
</style>
