// vite.config.mjs
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/curve/', // Keep this as it's correct for your GitHub Pages subpath

  build: {
    outDir: 'dist', // Ensure output directory is 'dist'
    rollupOptions: {
      input: {
        main: './index.html' // Keep this explicit input for clarity
      },
      output: {
        // --- ADD THESE OUTPUT OPTIONS ---
        // Ensures JS entry files are named correctly relative to the base
        entryFileNames: 'assets/[name]-[hash].js',
        // Ensures other assets (like CSS, images) are named correctly relative to the base
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // --------------------------------
      }
    }
  }
});