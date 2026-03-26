<script setup lang="ts">
import { ref, onMounted } from 'vue'
import client from '@/api/client'

const status = ref<'loading' | 'ok' | 'error'>('loading')
const dbStatus = ref('')

onMounted(async () => {
  try {
    const { data } = await client.get('/health')
    status.value = data.status === 'ok' ? 'ok' : 'error'
    dbStatus.value = data.db
  } catch {
    status.value = 'error'
    dbStatus.value = 'unreachable'
  }
})
</script>

<template>
  <main>
    <h1>secretsauce.food</h1>
    <p v-if="status === 'loading'">Checking backend connection...</p>
    <p v-else-if="status === 'ok'">Backend: connected (db: {{ dbStatus }})</p>
    <p v-else>Backend: error (db: {{ dbStatus }})</p>
  </main>
</template>

<style scoped>
main {
  padding: 2rem;
  font-family: sans-serif;
}
</style>
