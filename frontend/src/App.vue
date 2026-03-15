<!-- frontend/src/App.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useUserStore } from '@/stores/useUserStore'

const userStore = useUserStore()

onMounted(() => {
  userStore.initFromStorage()
})
</script>

<template>
  <RouterView />
</template>
