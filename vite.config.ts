import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { arduinoCli } from './plugins/arduinoCli.ts'

// https://vite.dev/config/
export default defineConfig({
  // arduinoCli only applies during `serve`, so the production build is unchanged.
  plugins: [react(), arduinoCli()],
})
