import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { CHAPTERS, ChapterDef } from './app/chapters';
import { lang, tr } from './app/i18n';
import { route } from './app/router';
import { ChapterShell } from './ui/ChapterShell';
import { Layout } from './ui/Layout';
import { Home } from './pages/Home';
import './styles.css';

document.documentElement.lang = lang.value;

function ChapterPage({ id }: { id: number }) {
  const [def, setDef] = useState<ChapterDef | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setDef(null); setFailed(false);
    const meta = CHAPTERS.find((c) => c.id === id);
    if (!meta) { setFailed(true); return; }
    meta.load().then((m) => { if (alive) setDef(m.default); }, (e) => { console.error(e); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [id]);
  if (failed) return <p>{tr({ ko: '이 장을 불러오지 못했습니다.', en: 'Could not load this chapter.' })} <a href="#/">{tr({ ko: '처음으로', en: 'Home' })}</a></p>;
  if (!def) return <p class="muted" aria-busy="true">{tr({ ko: '불러오는 중…', en: 'Loading…' })}</p>;
  return <ChapterShell key={def.id} def={def} />;
}

function ReportPage() {
  const [Comp, setComp] = useState<null | (() => preact.JSX.Element)>(null);
  useEffect(() => { import('./pages/Report').then((m) => setComp(() => m.Report)); }, []);
  return Comp ? <Comp /> : <p class="muted" aria-busy="true">{tr({ ko: '불러오는 중…', en: 'Loading…' })}</p>;
}

function App() {
  const r = route.value;
  return (
    <Layout>
      {r.page === 'home' && <Home />}
      {r.page === 'chapter' && <ChapterPage id={r.id} />}
      {r.page === 'report' && <ReportPage />}
    </Layout>
  );
}

render(<App />, document.getElementById('app')!);
