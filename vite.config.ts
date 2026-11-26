/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Reachable from the Mac over Tailscale via `tailscale serve`.
    allowedHosts: ['masters.tailf8caf3.ts.net'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
