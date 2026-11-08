import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves this repository below /cherware-genogram/.
  // Keep local development and non-Pages builds rooted at /.
  base: process.env.GITHUB_ACTIONS === 'true' ? '/cherware-genogram/' : '/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
});
