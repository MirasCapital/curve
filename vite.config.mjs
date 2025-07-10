// vite.config.mjs
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  // Only use /curve/ if you're deploying to github.io/curve/
  // Use './' for relative paths (recommended)
  base: process.env.NODE_ENV === 'production' ? '/curve/' : './',
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});