import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The browser only ever calls same-origin `/api/...`. In production the nginx
    // in this repo's image forwards that to the API container; here in
    // development Vite does the same, so no code needs to know where the API lives
    // and there is no CORS to configure.
    proxy: {
      '/api': {
        target: process.env['API_URL'] ?? 'http://localhost:8080',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom', // a simulated browser, so components can render in tests
    setupFiles: ['./src/test/setup.ts'],
  },
})
