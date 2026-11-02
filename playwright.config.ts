import { defineConfig } from '@playwright/test';

// Un solo worker: las pruebas comparten el portapapeles del sistema.
export default defineConfig({
  testDir: './src/tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
