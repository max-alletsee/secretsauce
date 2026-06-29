import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'

import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/sn-pro/400.css'
import '@fontsource/sn-pro/600.css'
import '@fontsource/sn-pro/700.css'

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
