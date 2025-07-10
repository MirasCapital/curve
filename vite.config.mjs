// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Add this 'base' property
  base: '/curve/', // This tells Vite your app will be served from https://www.mirascapital.com/curve/
});git status