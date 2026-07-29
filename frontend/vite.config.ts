/// <reference types="vite-react-ssg" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  ssgOptions: {
    script: 'async',
    // /pulse -> dist/pulse/index.html so Vercel serves it before the SPA rewrite.
    dirStyle: 'nested',
    // Prerender ONLY the public marketing pages. Every other route stays a pure
    // client-side SPA (served via the index.html fallback) — auth/data routes
    // must not be statically rendered.
    includedRoutes: () => ['/', '/pulse'],
    // Skip critical-CSS inlining (critters/beasties) — avoids an optional native
    // peer dep in CI; the normal stylesheet link still ships.
    crittersOptions: false,
  },
})
