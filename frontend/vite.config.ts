import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` is set via env so the same build works locally and on GitHub Pages (/<repo>/).
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:4000', changeOrigin: true },
    },
  },
});
