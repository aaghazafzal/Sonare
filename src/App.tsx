import { useEffect, useState } from 'react';
import { AudioWaveform, Piano, Settings2, Volume2, VolumeX } from 'lucide-react';
import { PlayPage } from './pages/PlayPage';
import { StudioPage } from './pages/StudioPage';
import { SettingsPage } from './pages/SettingsPage';
import { applySettings, useSettings } from './theme/settings';
import { installKeyboardInput } from './audio/input';
import { ensureAudio, master, useLoading } from './audio/engine';
import { LevelMeter } from './components/ui';
import { useStudio } from './studio/store';
import * as Tone from 'tone';

type Route = 'play' | 'studio' | 'settings';
const routeFromHash = (): Route => {
  const h = location.hash.replace('#/', '');
  return h === 'studio' || h === 'settings' ? h : 'play';
};

function Wordmark() {
  return (
    <div className="wordmark" aria-label="Sonare">
      <svg viewBox="0 0 28 28" width="26" height="26" aria-hidden>
        <rect x="1" y="1" width="26" height="26" rx="6" fill="var(--panel-alt)" stroke="var(--border-strong)" />
        <g fill="var(--text)">
          <rect x="6" y="6" width="3.4" height="16" rx="1" />
          <rect x="10.6" y="6" width="3.4" height="16" rx="1" />
          <rect x="15.2" y="6" width="3.4" height="16" rx="1" />
          <rect x="19.8" y="6" width="3.4" height="16" rx="1" />
        </g>
        <g fill="var(--primary)">
          <rect x="8.6" y="6" width="2.8" height="9.5" rx="0.8" />
          <rect x="17.8" y="6" width="2.8" height="9.5" rx="0.8" />
        </g>
      </svg>
      <span>Sonare</span>
    </div>
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
  useEffect(() => {
    const on = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (r: Route) => {
    location.hash = `#/${r}`;
  };

  const nav: { id: Route; label: string; icon: typeof Piano }[] = [
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
          {pending > 0 && <span className="rail-loading" title="Loading samples" />}
          <LevelMeter meter={master.meter} className="rail-meter" />
          <span className="rail-db mono" title="Master level">
            <Volume2 size={12} /> {masterDb.toFixed(0)}
          </span>
        </div>
      </nav>
      <main className="content">
        <AudioGate />
        {route === 'play' && <PlayPage goStudio={() => go('studio')} />}
        {route === 'studio' && <StudioPage />}
        {route === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
