import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served at https://royaye-bita.github.io/ (root). Set BASE=/bita-app/ to build for the old saman882.github.io/bita-app address.
export default defineConfig({
  base: process.env.BASE || '/',
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(process.env.BUILD_ID || 'dev') },
})
