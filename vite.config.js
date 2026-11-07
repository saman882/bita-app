import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE: '/bita-app/' for GitHub Pages; set BASE=/ for a root domain host
export default defineConfig({
  base: process.env.BASE || '/bita-app/',
  plugins: [react()],
})
