// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/curve/', // Ensure this matches your repository name (case-sensitive)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});