// 개발용: node scripts/shot.mjs <route> <out.png> [width] [selector|full] [clickSelectors,comma] — 화면을 찍고 콘솔 오류를 출력한다.
import { chromium } from '@playwright/test';
const [routeArg = '', out = '.cache/shot.png', width = '1440', sel = 'full', clicks = '', base = 'http://localhost:5173/'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(base + '#/' + routeArg);
await page.waitForTimeout(1500);
for (const c of clicks.split(',').filter(Boolean)) { await page.locator(c).first().click(); await page.waitForTimeout(700); }
if (sel === 'full') await page.screenshot({ path: out, fullPage: true });
else if (sel === 'view') await page.screenshot({ path: out });
else { await page.addStyleTag({ content: '.header,.budgetbar,.sidebar{position:absolute !important}' }); const el = page.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(1200); await el.screenshot({ path: out }); }
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
