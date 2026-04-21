import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'

import App from './App.vue'
import router from './router'
import { useUserStore } from './stores/useUserStore'
import './assets/main.css'

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(PrimeVue, { unstyled: true })

// Kick off auth restoration before the router processes its first navigation.
// The router guard awaits userStore.authReady, which resolves when this completes.
useUserStore().initFromStorage()

app.mount('#app')
