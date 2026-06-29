import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Cargar .env.test (creds del E2E) si existe, sin dependencia de dotenv. Las vars
// ya presentes en el entorno tienen prioridad.
try {
  const txt = readFileSync(resolve(process.cwd(), '.env.test'), 'utf8')
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch {
  // sin .env.test → se usan las vars del entorno (o los tests se saltean)
}

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  // Los tests crean/borran docs sobre el mismo Supabase → serializar.
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US' },
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
