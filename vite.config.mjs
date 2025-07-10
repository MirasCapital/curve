// vite.config.mjs
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Determine the base path
// Use '/curve/' for GitHub Pages project sites when deployed,
// otherwise use '/' for local development.
const BASE_PATH = process.env.NODE_ENV === 'production' && process.env.VITE_APP_DEPLOY_ENV === 'github-pages'
  ? '/curve/'
  : '/';

export default defineConfig({
  plugins: [react()],
  base: BASE_PATH, // Use the dynamically determined base path

  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html'
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      }
    }
  }
});