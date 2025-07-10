// vite.config.mjs
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/curve/', // Keep this as it's correct for your GitHub Pages subpath

  // --- ADD THIS BUILD CONFIGURATION ---
  build: {
    rollupOptions: {
      input: {
        main: './index.html' // Explicitly tell Vite to use the root index.html as the main entry point
      }
    },
    outDir: 'dist' // Ensure output directory is 'dist'
  }
  // ------------------------------------
});