import { ComponentChildren } from 'preact';
import { CHAPTERS } from '../app/chapters';
import { lang, setLang, tr } from '../app/i18n';
import { route } from '../app/router';
import { navOpen, settingsOpen, solved, theme, visited } from '../app/store';
import { BudgetBar } from './BudgetBar';
import { SettingsPanel } from './SettingsPanel';

export function Layout({ children }: { children: ComponentChildren }) {
  const r = route.value;
  const cur = r.page === 'chapter' ? r.id : -1;
  const themeNext = theme.value === 'auto' ? 'dark' : theme.value === 'dark' ? 'light' : 'auto';
  const themeLabel = { auto: { ko: '자동', en: 'Auto' }, dark: { ko: '어둡게', en: 'Dark' }, light: { ko: '밝게', en: 'Light' } }[theme.value];
  return (
    <>
      <a class="sr-only" href="#main">{tr({ ko: '본문으로 건너뛰기', en: 'Skip to content' })}</a>
      <header class="header">
        <button type="button" class="btn icon ghost only-mobile" aria-label={tr({ ko: '목차 열기', en: 'Open contents' })} aria-expanded={navOpen.value} onClick={() => (navOpen.value = !navOpen.value)} data-testid="nav-toggle">☰</button>
        <a class="brand" href="#/">{tr({ ko: '군집은 서로를 어떻게 아는가', en: 'How does a swarm know itself?' })}<small>{tr({ ko: 'UWB 실내 군집 인터랙티브 교재', en: 'An interactive textbook on UWB indoor swarms' })}</small></a>
        <button type="button" class="btn ghost" onClick={() => setLang(lang.value === 'ko' ? 'en' : 'ko')} aria-label={tr({ ko: '언어 전환: English', en: '언어 전환: 한국어' })} data-testid="lang-toggle">{lang.value === 'ko' ? 'EN' : '한국어'}</button>
        <button type="button" class="btn ghost" onClick={() => (theme.value = themeNext)} aria-label={tr({ ko: `화면 테마: ${themeLabel.ko}`, en: `Theme: ${themeLabel.en}` })} data-testid="theme-toggle">◐ <span class="sr-only">{tr(themeLabel)}</span></button>
        <button type="button" class="btn primary" onClick={() => (settingsOpen.value = true)} data-testid="settings-open">⚙ {tr({ ko: '설정', en: 'Settings' })}</button>
      </header>
      {navOpen.value && <div class="scrim only-mobile" onClick={() => (navOpen.value = false)} />}
      <nav class={`sidebar${navOpen.value ? ' open' : ''}`} aria-label={tr({ ko: '목차', en: 'Contents' })}>
        <a class="nav-item" href="#/" aria-current={r.page === 'home' ? 'page' : undefined} onClick={() => (navOpen.value = false)}><span class="nav-num">⌂</span><span>{tr({ ko: '시작하기', en: 'Start here' })}</span></a>
        {CHAPTERS.map((c) => {
          const done = visited.value.includes(c.id);
          const nSolved = solved.value.filter((id) => id.startsWith(`ch${c.id}-`)).length;
          return (
            <a key={c.id} class="nav-item" href={`#/ch/${c.id}`} aria-current={cur === c.id ? 'page' : undefined} onClick={() => (navOpen.value = false)} data-testid={`nav-ch${c.id}`}>
              <span class="nav-num">{c.id}</span><span>{tr(c.title)}</span>
              <span class="nav-check" aria-label={done ? tr({ ko: '읽음', en: 'visited' }) : undefined}>{done ? '✓' : ''}{nSolved ? `·${nSolved}` : ''}</span>
            </a>
          );
        })}
        <a class="nav-item" href="#/report" aria-current={r.page === 'report' ? 'page' : undefined} onClick={() => (navOpen.value = false)} data-testid="nav-report"><span class="nav-num">▤</span><span>{tr({ ko: '우리 시스템 리포트', en: 'Our system report' })}</span></a>
        <p class="muted small" style={{ padding: '14px 8px 0' }}>
          <span class="badge lit">{tr({ ko: '문헌', en: 'Lit.' })}</span> {tr({ ko: '확인한 문헌 값', en: 'verified in a source' })}<br />
          <span class="badge der">{tr({ ko: '유도', en: 'Derived' })}</span> {tr({ ko: '교재 안에서 계산', en: 'computed in this book' })}<br />
          <span class="badge ex">{tr({ ko: '예시값', en: 'Example' })}</span> {tr({ ko: '출처 없는 가정', en: 'assumption, no source' })}
        </p>
      </nav>
      <main class="main" id="main" tabIndex={-1}>
        <div class="page">{children}</div>
      </main>
      <BudgetBar />
      {settingsOpen.value && <SettingsPanel />}
    </>
  );
}
