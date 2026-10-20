/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const fixtures = fileURLToPath(new URL('../fixtures/synthetic', import.meta.url))

// The browser talks to /api; the backend serves the same routes without the prefix.
const proxy = {
  '/api': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
}

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@fixtures': fixtures } },
  server: { fs: { allow: ['..'] }, proxy },
  preview: { proxy },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
})
