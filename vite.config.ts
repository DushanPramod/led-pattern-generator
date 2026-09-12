import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { arduinoCli } from './plugins/arduinoCli.ts'

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  // arduinoCli only applies during `serve`, so the production build is unchanged.
  plugins: [react(), arduinoCli()],
  // The About dialog shows the version straight from package.json.
  define: { __APP_VERSION__: JSON.stringify(version) },
})
