import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// ARCHITECTURE.md §3: dev server proxies /api to Express (same origin for the
// browser → session cookies just work). Production build lands in server/public
// so the Express process can serve API + SPA from a single port.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Sandbox live-preview hostnames (https://5173-<id>.e2b.app) + local dev.
    allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'],
  },
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
