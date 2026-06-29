import { defineConfig } from 'vitest/config'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Resolver el alias `@/` igual que tsconfig (`"@/*": ["./*"]`).
  resolve: {
    alias: { '@': root },
  },
  test: {
    // node por defecto; el test de markdown pide jsdom con un pragma de archivo
    // (`// @vitest-environment jsdom`).
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
