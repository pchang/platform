/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Oxigraph loads its WebAssembly module from beside its own file; pre-bundling would move it.
  optimizeDeps: { exclude: ['oxigraph'] },
  // During development with a running gateway (VITE_GATEWAY=http), /api goes to it.
  server: { proxy: { '/api': 'http://localhost:8787', '/mcp': 'http://localhost:8787' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
