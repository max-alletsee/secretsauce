<!-- frontend/src/views/LoginView.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/useUserStore'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import Wordmark from '@/components/base/Wordmark.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const email = ref('')
const password = ref('')
const rateLimitError = ref('')
const credentialsError = ref('')
const loading = ref(false)

async function submit() {
  rateLimitError.value = ''
  credentialsError.value = ''
  loading.value = true
  try {
    await userStore.login({ email: email.value, password: password.value })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/recipes'
    router.push(redirect)
  } catch (err: any) {
    if (err?.response?.status === 429) {
      rateLimitError.value = 'Too many login attempts. Please wait a minute and try again.'
    } else {
      credentialsError.value = 'Invalid email or password.'
    }
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
      <h1>Sign in</h1>
      <form class="auth-form" @submit.prevent="submit" novalidate>
        <BaseInput
          id="email"
          v-model="email"
          label="Email"
          type="email"
          autocomplete="email"
          required
          :disabled="loading"
          :error="credentialsError"
        />
        <BaseInput
          id="password"
          v-model="password"
          label="Password"
          type="password"
          autocomplete="current-password"
          required
          :disabled="loading"
          :error="credentialsError"
        />
        <p v-if="rateLimitError" class="auth-error" role="alert">{{ rateLimitError }}</p>
        <BaseButton type="submit" variant="primary" :loading="loading" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </BaseButton>
      </form>
      <p class="switch-link">
        No account? <RouterLink to="/register">Create one</RouterLink>
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
