import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://neerus-kitchen.netlify.app',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: ['index.html', 'admin.html'],
    },
  },
})
