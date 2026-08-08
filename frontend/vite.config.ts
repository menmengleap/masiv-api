import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev, proxy API + health to the backend so the browser talks to the
// frontend origin only (first-party cookies "just work").
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/health': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
