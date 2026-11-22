/**
 * §7.3 브라우저 스모크 테스트 (헤드리스 Chromium, 빌드 결과물 대상).
 *  - 모든 챕터를 열고, 데모를 한 번씩 조작하고, 손코딩 과제 하나를 정답으로 제출한다.
 *  - 콘솔 에러 0개, 로컬 서버 밖으로 나가는 네트워크 요청 0개.
 *  - 데스크톱(1440px)과 모바일(390px) 폭에서 챕터마다 스크린샷을 screenshots/ 에 저장한다.
 */
import { Page, expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;
const CHAPTERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function watch(page: Page) {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:', 'about:'].includes(u.protocol)) external.push(r.url());
  });
  return { errors, external };
}

/** 화면에 있는 데모 컨트롤을 종류별로 한 번씩 조작한다 */
async function pokeDemos(page: Page) {
  // 예측 먼저: 객관식은 첫 선택지, 슬라이더형은 제출
  for (const b of await page.locator('.card.predict').all()) {
    const submit = b.locator('[data-testid$="-submit"]');
    if (await submit.count()) await submit.first().click();
    else if (await b.locator('button[aria-pressed]').count()) await b.locator('button[aria-pressed]').first().click();
  }
  // 슬라이더: 방향키로 두 칸
  const sliders = page.locator('.card.demo input[type=range], .card.pitfall input[type=range]');
  const nS = await sliders.count();
  for (let i = 0; i < nS; i++) {
    const s = sliders.nth(i);
    if (!(await s.isVisible()) || (await s.isDisabled())) continue;
    await s.focus();
    await s.press('ArrowRight');
    await s.press('ArrowRight');
  }
  // 선택 버튼 묶음: 두 번째 선택지
  const segs = page.locator('.card.demo .seg, .card.pitfall .seg');
  const nG = await segs.count();
  for (let i = 0; i < nG; i++) {
    const btns = segs.nth(i).locator('button');
    if ((await btns.count()) > 1 && (await btns.nth(1).isVisible())) await btns.nth(1).click();
  }
  // 체크박스
  const checks = page.locator('.card.demo input[type=checkbox], .card.pitfall input[type=checkbox]');
  const nC = await checks.count();
  for (let i = 0; i < nC; i++) if (await checks.nth(i).isVisible()) await checks.nth(i).click();
  await page.waitForTimeout(400);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('홈 화면, 설정 패널, 언어·테마 전환', async ({ page }) => {
      const w = watch(page);
      await page.goto('#/');
      await expect(page.getByTestId('home')).toBeVisible();
      await page.getByTestId('settings-open').click();
      await expect(page.getByTestId('settings-panel')).toBeVisible();
      // UWB 묶음은 접혀 있으므로 먼저 펼친다
      await page.locator('details', { has: page.getByTestId('set-uwb.mode') }).locator('summary').click();
      await page.getByTestId('set-uwb.mode').selectOption('twr');
      await page.getByTestId('set-hall.x').fill('18');
      await page.getByTestId('set-hall.x').press('Enter');
      await page.getByTestId('anchors-same-height').click();
      await page.getByTestId('settings-reset').evaluate((el) => { window.confirm = () => true; (el as HTMLElement).click(); });
      await page.screenshot({ path: `screenshots/settings-${vp.name}.png` });
      await page.getByTestId('settings-close').click();
      await page.getByTestId('lang-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await page.screenshot({ path: `screenshots/home-en-${vp.name}.png`, fullPage: true });
      await page.getByTestId('lang-toggle').click();
      await page.getByTestId('theme-toggle').click();
      await page.screenshot({ path: `screenshots/home-dark-${vp.name}.png`, fullPage: true });
      await page.getByTestId('budget-toggle').click();
      await expect(page.locator('#budget-panel')).toBeVisible();
      expect(w.errors, '콘솔 에러').toEqual([]);
      expect(w.external, '외부 네트워크 요청').toEqual([]);
    });

    for (const ch of CHAPTERS) {
      test(`${ch}장: 열기 → 데모 조작 → 과제 제출 → 스크린샷`, async ({ page }) => {
        const w = watch(page);
        await page.goto(`#/ch/${ch}`);
        const article = page.getByTestId(`chapter-${ch}`);
        await expect(article).toBeVisible({ timeout: 30_000 });
        // 필수 블록이 화면에 있는가
        await expect(article.locator('.card.objectives')).toBeVisible();
        expect(await article.locator('.card.predict').count(), '예측 먼저').toBeGreaterThan(0);
        expect(await article.locator('.card.demo').count(), '데모').toBeGreaterThan(0);
        expect(await article.locator('.card.derivation').count(), '유도').toBeGreaterThan(0);
        expect(await article.locator('.card.pitfall').count(), '함정 실험실').toBeGreaterThan(0);
        await expect(article.locator('.card.summary')).toBeVisible();
        expect(await article.locator('.badge').count(), '출처 배지').toBeGreaterThan(3);
        expect(await article.locator('.katex').count(), '수식').toBeGreaterThan(0);
        expect(await article.locator('.katex-error').count(), '수식 오류').toBe(0);

        await pokeDemos(page);

        if (ch >= 1) {
          // 손코딩 과제 하나를 정답으로 제출
          const task = article.locator('.card.task').first();
          await task.scrollIntoViewIfNeeded();
          const id = await task.getAttribute('data-task-id');
          await task.getByTestId(`solution-${id}`).click();
          await task.getByTestId(`fill-${id}`).click();
          const result = task.getByTestId(`result-${id}`);
          await expect(result).toHaveAttribute('data-ok', 'true', { timeout: 120_000 });
        }
        // 가로로 넘치는 곳이 없는가(모바일 레이아웃)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, '가로 스크롤 넘침(px)').toBeLessThanOrEqual(1);

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        await page.screenshot({ path: `screenshots/ch${ch}-${vp.name}.png`, fullPage: true });
        expect(w.errors, '콘솔 에러').toEqual([]);
        expect(w.external, '외부 네트워크 요청').toEqual([]);
      });
    }

    test('우리 시스템 리포트', async ({ page }) => {
      const w = watch(page);
      await page.goto('#/report');
      await expect(page.getByTestId('report')).toBeVisible({ timeout: 30_000 });
      expect(await page.locator('.badge').count()).toBeGreaterThan(10);
      await page.emulateMedia({ media: 'print' });
      await page.screenshot({ path: `screenshots/report-print-${vp.name}.png`, fullPage: true });
      await page.emulateMedia({ media: 'screen' });
      await page.screenshot({ path: `screenshots/report-${vp.name}.png`, fullPage: true });
      expect(w.errors, '콘솔 에러').toEqual([]);
      expect(w.external, '외부 네트워크 요청').toEqual([]);
    });
  });
}
