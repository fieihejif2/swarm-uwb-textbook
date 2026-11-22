import { defineConfig } from '@playwright/test';

/** §7.3 브라우저 스모크 테스트: 빌드 결과물(dist/)을 로컬 정적 서버로 띄워 헤드리스 Chromium 으로 확인한다. */
export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  timeout: 240_000,
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173/', browserName: 'chromium', headless: true },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173/', reuseExistingServer: true, timeout: 60_000 },
});
