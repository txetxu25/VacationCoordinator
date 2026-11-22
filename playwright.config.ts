import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de la interfaz en modo demo (sin Google), con pantalla de iPhone.
 * Se ejecutan contra la compilación de producción servida con `vite preview`.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    ...devices['iPhone 14'],
    // Chromium con pantalla de iPhone (los gestos se simulan con el protocolo de Chromium)
    browserName: 'chromium',
    // En CI se usa el navegador que instala Playwright; aquí, el preinstalado si existe
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
