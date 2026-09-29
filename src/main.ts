import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createForgeRouter } from './application/router'

createApp(App).use(createForgeRouter()).mount('#app')
