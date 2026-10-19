/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.PASSPORT_API_TARGET || 'http://localhost:8080';

  const api: ProxyOptions = { target, changeOrigin: false, xfwd: true };

  const proxy: Record<string, ProxyOptions> = {
    '/v1': api,
    '/admin/v1': api,
    '/oauth2': api,
    '/saml': api,
    '^/federation/(?!complete(?:[/?#]|$))': api,
    '/.well-known': api,
    '/jwks.json': api,
    '/livez': api,
    '/readyz': api,
  };

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy,
    },
    preview: {
      port: 4173,
      strictPort: true,
      proxy,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      css: false,
      restoreMocks: true,
      unstubGlobals: true,
      maxWorkers: 1,
      testTimeout: 20_000,
    },
  };
});
