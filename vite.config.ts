import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 }, // three.js is big; it's lazy-loaded on the landing page
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        headers: { origin: 'http://localhost:3001' },
      },
    },
  },
})
