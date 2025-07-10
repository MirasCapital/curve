// vite.config.mjs
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Determine the base path for production GitHub Pages deployment
const BASE_PATH = process.env.NODE_ENV === 'production' && process.env.VITE_APP_DEPLOY_ENV === 'github-pages'
  ? '/curve/'
  : '/';

export default defineConfig({
  plugins: [react()],
  base: BASE_PATH,

  // --- CRITICAL CHANGES HERE ---
  // Ensure your index.html is in the project root, not in 'public' if this is used.
  // By setting publicDir to false, Vite doesn't treat 'public' as a special dir
  // and expects assets to be referenced relative to 'root' or 'base'.
  publicDir: false, // Prevents Vite from copying public/ to dist, assumes assets handled by build
  root: '.', // Explicitly set the root of your project for Vite

  build: {
    outDir: 'dist',
    rollupOptions: {
      // Input should just be your main entry point, not index.html here anymore.
      // Vite will automatically pick up index.html from the root.
      // If you had a different entry, e.g., 'src/main.ts', keep it.
      // If your main entry is src/main.tsx, then this is not needed or could be set to main.tsx
      // For a typical Vite React app with index.html at root, no explicit input is usually needed here.
    },
    // Ensure output assets are correctly named for the base path
    assetsDir: 'assets', // Ensure this is consistent with base/assets
  }
});