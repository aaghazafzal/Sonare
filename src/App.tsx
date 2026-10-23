import { lazy, Suspense, useEffect, useState } from 'react';
import { AudioWaveform, House, Piano, Settings2, Volume2, VolumeX } from 'lucide-react';
import { PlayPage } from './pages/PlayPage';
import { HomePage } from './pages/HomePage';
import { LogoMark } from './components/Logo';
import { setLesson } from './learn/lesson';
import { applySettings, useSettings } from './theme/settings';
import { installKeyboardInput } from './audio/input';
import { ensureAudio, master, useLoading } from './audio/engine';
import { FullscreenButton, LevelMeter } from './components/ui';
import { installUiSounds } from './audio/uiSounds';
import { installAutosave } from './studio/projects';
import { useStudio } from './studio/store';
import * as Tone from 'tone';

// the studio, settings and info pages load on first visit, so Home and Play open faster
const StudioPage = lazy(() => import('./pages/StudioPage').then((m) => ({ default: m.StudioPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const PrivacyPage = lazy(() => import('./pages/InfoPages').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./pages/InfoPages').then((m) => ({ default: m.TermsPage })));
const NotFoundPage = lazy(() => import('./pages/InfoPages').then((m) => ({ default: m.NotFoundPage })));

type Route = 'home' | 'play' | 'studio' | 'settings' | 'privacy' | 'terms' | 'notfound';
const ROUTES: Route[] = ['home', 'play', 'studio', 'settings', 'privacy', 'terms'];
const routeFromHash = (): Route => {
  // any path but the root (the offline app answers every address with index.html) is a missing page
  if (!/^\/(index\.html)?$/.test(location.pathname)) return 'notfound';
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (!h) return 'home';
  return ROUTES.includes(h as Route) ? (h as Route) : 'notfound';
};
const TITLES: Record<Route, string> = {
  home: 'Sonare — Play piano, guitar, drums & 112 instruments online, free music studio',
  play: 'Play — Sonare online instruments',
  studio: 'Studio — Sonare beat maker & recorder',
  settings: 'Settings — Sonare',
  privacy: 'Privacy policy — Sonare',
  terms: 'Terms of use — Sonare',
  notfound: 'Page not found — Sonare',
};
/** "#/play?songs" (app shortcut, home page) opens the song list */
function readHashQuery() {
  const q = location.hash.split('?')[1];
  if (q === 'songs') {
    // the song list lives in the Big piano on laptops
    useSettings.getState().update({ playLayout: 'big' });
    setLesson({ pickerOpen: true });
    history.replaceState(null, '', '#/play');
  }
}

function Wordmark() {
  return (
    <a className="wordmark" aria-label="Sonare home" href="#/home">
      <LogoMark />
      <span>Sonare</span>
    </a>
  );
}

function AudioGate() {
  const [state, setState] = useState(Tone.getContext().state);
  useEffect(() => {
    const ctx = Tone.getContext().rawContext;
    const on = () => setState(Tone.getContext().state);
    ctx.addEventListener('statechange', on);
    const unlock = () => void ensureAudio();
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => ctx.removeEventListener('statechange', on);
  }, []);
  if (state === 'running') return null;
  return (
    <button className="audio-gate" onClick={() => void ensureAudio()}>
      <VolumeX size={14} /> Sound is paused by the browser — click anywhere or press a key to start audio
    </button>
  );
}

export default function App() {
  const settings = useSettings();
  const [route, setRoute] = useState<Route>(routeFromHash);
  const pending = useLoading((s) => Object.keys(s.pending).length);
  const masterDb = useStudio((s) => s.project.master);

  useEffect(() => applySettings(settings), [settings]);
  useEffect(() => installKeyboardInput(), []);
  useEffect(() => installUiSounds(), []);
  useEffect(() => installAutosave(), []);
  useEffect(() => {
    document.title = TITLES[route];
  }, [route]);
  useEffect(() => {
    readHashQuery();
    const on = () => {
      readHashQuery();
      setRoute(routeFromHash());
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (r: Route) => {
    location.hash = `#/${r}`;
  };

  const nav: { id: Route; label: string; icon: typeof Piano }[] = [
    { id: 'home', label: 'Home', icon: House },
    { id: 'play', label: 'Play', icon: Piano },
    { id: 'studio', label: 'Studio', icon: AudioWaveform },
    { id: 'settings', label: 'Settings', icon: Settings2 },
  ];

  return (
    <div className="app">
      <nav className="rail">
        <Wordmark />
        <div className="rail-nav">
          {nav.map((n) => (
            <button key={n.id} className={`rail-item ${route === n.id ? 'on' : ''}`} onClick={() => go(n.id)} aria-current={route === n.id}>
              <n.icon />
              <span>{n.label}</span>
            </button>
          ))}
        </div>
        <div className="spacer" />
        <div className="rail-foot">
          <FullscreenButton className="btn icon ghost rail-fs" />
          {pending > 0 && <span className="rail-loading" title="Loading samples" />}
          <LevelMeter meter={master.meter} className="rail-meter" />
          <span className="rail-db mono" title="Master level">
            <Volume2 size={12} /> {masterDb.toFixed(0)}
          </span>
        </div>
      </nav>
      <main className="content">
        <AudioGate />
        <Suspense fallback={<div className="page-loading" aria-label="Loading" />}>
          {route === 'home' && <HomePage />}
          {route === 'play' && <PlayPage goStudio={() => go('studio')} />}
          {route === 'studio' && <StudioPage />}
          {route === 'settings' && <SettingsPage />}
          {route === 'privacy' && <PrivacyPage />}
          {route === 'terms' && <TermsPage />}
          {route === 'notfound' && <NotFoundPage />}
        </Suspense>
      </main>
    </div>
  );
}
