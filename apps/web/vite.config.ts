import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // `define` replaces this name with a literal while building, so the version is
  // baked into the bundle. CI sets VERSION (for example sha-1a2b3c4); a local run
  // has none and shows "dev".
  define: {
    __WEB_VERSION__: JSON.stringify(process.env['VERSION'] ?? 'dev'),
  },
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
})
