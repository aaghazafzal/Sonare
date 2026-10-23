import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowRight, Check, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import * as Tone from 'tone';
import { Keyboard, keyGeometry } from '../components/instruments/Keyboard';
import { InstallButton } from '../components/ui';
import { noteOff, noteOn, useLive, liveStrip } from '../audio/live';
import { Voice, ensureAudio } from '../audio/engine';
import { pianoKeyLabels } from '../audio/input';
import { useSettings } from '../theme/settings';
import { THEME_PRESETS } from '../theme/presets';
import { openSong, setLesson } from '../learn/lesson';
import { LEVEL_LABEL, SONGS, songById } from '../learn/songs';
import { fromTemplate } from '../studio/store';
import { startProject } from '../studio/projects';
import { DEFAULT_INSTRUMENT, FAMILY_LABELS, FAMILY_ORDER, INSTRUMENTS, KITS, displayName } from '../lib/instruments';
import { useMobile } from '../lib/useMobile';

/* ------------------------------------------------------------ helpers */

const go = (r: 'play' | 'studio' | 'settings') => {
  location.hash = `#/${r}`;
};
const learn = () => {
  useSettings.getState().update({ playLayout: 'big' });
  setLesson({ pickerOpen: true });
  go('play');
};

/** One shared voice for every "hear it" on this page, so it never touches the live instrument. */
let preview: Voice | null = null;
async function previewVoice(id: string) {
  await ensureAudio();
  preview ??= new Voice(liveStrip.input);
  await preview.setInstrument(id);
  return preview;
}

/** Fades sections in as they scroll into view (content stays visible without script). */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.classList.add('js');
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('in');
          io.unobserve(e.target);
        }),
      { root: el, threshold: 0.12 },
    );
    el.querySelectorAll('.rv').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [root]);
}

/* ------------------------------------------- hero: the big piano, live */

const DEMO = (() => {
  const s = songById('ode')!;
  const notes = s.notes.filter((n) => n.hand === 'R' && n.start < 32);
  return { notes, bpm: 104, length: 32 };
})();
const LOW = 53;
const HIGH = 74;
const LEAD = 2.5; // beats visible above the keys

function HeroWindow() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useLive((s) => s.active);
  const octave = useLive((s) => s.octave);
  const keymap = useSettings((s) => s.keymap);
  const skin = useSettings((s) => s.skins.keyboard);
  const touch = !!useMobile();
  const [sound, setSound] = useState(false);
  const [running, setRunning] = useState(true);
  const [demo, setDemo] = useState<Record<number, true>>({});
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const labels = useMemo(() => pianoKeyLabels(octave, keymap), [octave, keymap]);
  const geo = useMemo(() => keyGeometry(LOW, HIGH), []);
  const active = useMemo(() => ({ ...demo, ...live }), [demo, live]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !running) return;
    const ctx = c.getContext('2d')!;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const beatMs = 60000 / DEMO.bpm;
    const t0 = performance.now() - (still ? 6 * beatMs : 0);
    let raf = 0;
    let lastBeat = -1;
    let key = '';
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(c);
    const css = (n: string) => getComputedStyle(c).getPropertyValue(n).trim();
    const colours = { note: css('--primary'), grid: css('--border'), text: css('--on-primary') };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const beat = ((now - t0) / beatMs) % DEMO.length;
      const dpr = window.devicePixelRatio || 1;
      const W = c.clientWidth;
      const H = c.clientHeight;
      if (c.width !== Math.round(W * dpr)) c.width = Math.round(W * dpr);
      if (c.height !== Math.round(H * dpr)) c.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const ppb = H / LEAD;
      ctx.fillStyle = colours.grid;
      for (const [m, g] of geo) if (m % 12 === 0) ctx.fillRect(Math.round(g.left * W), 0, 1, H);
      for (let b = Math.ceil(beat / 4) * 4; b < beat + LEAD + 4; b += 4) ctx.fillRect(0, Math.round(H - (b - beat) * ppb), W, 1);

      const on: number[] = [];
      ctx.font = `600 11px ${css('--font-ui') || 'sans-serif'}`;
      ctx.textAlign = 'center';
      for (const loop of [0, DEMO.length]) {
        for (const n of DEMO.notes) {
          const start = n.start + loop;
          const yb = H - (start - beat) * ppb;
          const yt = H - (start + n.dur - beat) * ppb;
          if (yb < 0 || yt > H) continue;
          const g = geo.get(n.pitch);
          if (!g) continue;
          const sounding = beat >= start && beat < start + n.dur;
          if (sounding) on.push(n.pitch);
          const x = g.left * W + 2;
          const w = g.width * W - 4;
          ctx.globalAlpha = sounding ? 1 : 0.85;
          ctx.fillStyle = colours.note;
          ctx.beginPath();
          ctx.roundRect(x, yt + 1, w, Math.max(6, yb - yt - 2), 4);
          ctx.fill();
          ctx.globalAlpha = 1;
          if (yb - yt > 22 && w > 16) {
            ctx.fillStyle = colours.text;
            ctx.fillText(touch ? '' : (labels.get(n.pitch)?.toUpperCase() ?? ''), x + w / 2, Math.min(H - 6, yb - 7));
          }
        }
      }

      // the notes that land this frame
      const whole = Math.floor(beat * 4);
      if (whole !== lastBeat) {
        lastBeat = whole;
        if (soundRef.current)
          for (const n of DEMO.notes)
            if (Math.floor(n.start * 4) === whole && preview) preview.play(n.pitch, (n.dur * beatMs) / 1000, Tone.now(), 0.6);
      }
      const k = on.join();
      if (k !== key) {
        key = k;
        setDemo(Object.fromEntries(on.map((m) => [m, true])));
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      setDemo({});
    };
  }, [running, geo, labels, touch]);

  const toggleSound = async () => {
    if (!sound) await previewVoice(DEFAULT_INSTRUMENT);
    setSound(!sound);
  };

  return (
    <div className="h-window" data-ui>
      <div className="h-window-bar">
        <span className="h-window-title">{displayName(DEFAULT_INSTRUMENT)}</span>
        <span className="h-window-song">Ode to Joy · Watch</span>
        <div className="spacer" />
        <button className="btn sm ghost" onClick={() => setRunning(!running)} aria-label={running ? 'Pause the demo' : 'Play the demo'}>
          {running ? <Pause /> : <Play />}
        </button>
        <button className={`btn sm ${sound ? 'on' : ''}`} onClick={() => void toggleSound()}>
          {sound ? <Volume2 /> : <VolumeX />} {sound ? 'Sound on' : 'Sound off'}
        </button>
      </div>
      <canvas ref={canvas} className="h-window-fall" aria-hidden />
      <div className="h-window-keys">
        <Keyboard
          low={LOW}
          high={HIGH}
          active={active}
          onDown={(m, v) => noteOn(m, v)}
          onUp={(m) => noteOff(m)}
          skin={skin}
          showCase={false}
          className="kb-flat"
          height={touch ? 130 : 170}
          renderLabel={(m, black) =>
            touch
              ? m % 12 === 0 && <span className="wk-name">C{m / 12 - 1}</span>
              : labels.get(m) && <span className={`keycap ${black ? 'on-black' : ''}`}>{labels.get(m)}</span>
          }
        />
      </div>
      <p className="h-window-foot">{touch ? 'Tap the keys to play along.' : 'Press the letters printed on the keys to play along.'}</p>
    </div>
  );
}

/* --------------------------------------------------------- instruments */

const FAMILIES = FAMILY_ORDER.map((f) => {
  const items = f === 'drums' ? KITS.map((k) => ({ id: `kit:${k.id}`, name: k.name })) : INSTRUMENTS.filter((i) => i.family === f);
  return { id: f, label: FAMILY_LABELS[f], items };
}).filter((f) => f.items.length);

function phraseFor(family: string, voice: Voice) {
  const t = Tone.now() + 0.05;
  if (family === 'drums') {
    const groove: [number, number][] = [
      [36, 0], [42, 0], [42, 0.5], [38, 1], [42, 1], [42, 1.5], [36, 2], [36, 2.5], [42, 2], [38, 3], [42, 3], [46, 3.5],
    ];
    for (const [m, b] of groove) voice.play(m, 0.2, t + b * 0.3, 0.85);
    return 1500;
  }
  const base = family === 'bass' ? 36 : family === 'percussion' || family === 'mallets' ? 72 : 60;
  const notes = [0, 4, 7, 12, 7, 4, 0];
  notes.forEach((d, i) => voice.play(base + d, 0.3, t + i * 0.22, 0.7));
  voice.play(base, 1, t + notes.length * 0.22, 0.6);
  voice.play(base + 4, 1, t + notes.length * 0.22, 0.6);
  voice.play(base + 7, 1, t + notes.length * 0.22, 0.6);
  return 2700;
}

function Instruments() {
  const [playing, setPlaying] = useState<string | null>(null);
  const hear = async (f: (typeof FAMILIES)[number]) => {
    setPlaying(f.id);
    const v = await previewVoice(f.items[0].id);
    const ms = phraseFor(f.id, v);
    setTimeout(() => setPlaying((p) => (p === f.id ? null : p)), ms);
  };
  const open = (id: string) => {
    useLive.getState().setInstrument(id);
    go('play');
  };
  return (
    <section className="h-section h-split" aria-labelledby="inst-h">
      <div className="h-copy rv">
        <h2 id="inst-h">Every sound is a real recording</h2>
        <p>
          {INSTRUMENTS.length} instruments and {KITS.length} drum kits, sampled note by note — from a concert grand to an oud, a
          sitar, a choir and a tuba. Each one has its own playing surface: a keyboard, a guitar neck, drum pads, a flute with
          fingerings.
        </p>
        <a className="btn primary lg" href="#/play">
          Browse all instruments <ArrowRight />
        </a>
      </div>
      <ul className="h-families rv" data-ui>
        {FAMILIES.map((f) => (
          <li key={f.id}>
            <button className="h-family-name" onClick={() => open(f.items[0].id)} title={`Open ${f.items[0].name}`}>
              <b>{f.label}</b>
              <span>{f.items.slice(0, 3).map((i) => i.name.replace(/ \(.*\)/, '')).join(', ')}</span>
            </button>
            <span className="h-family-count">{f.items.length}</span>
            <button className={`btn sm icon ${playing === f.id ? 'on' : ''}`} onClick={() => void hear(f)} aria-label={`Hear ${f.label}`}>
              <Play />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- learn */

function Learn() {
  const best = useMemo(() => {
    try {
      return (JSON.parse(localStorage.getItem('sonare.lesson') ?? '{}').state?.best ?? {}) as Record<string, number>;
    } catch {
      return {};
    }
  }, []);
  const start = (id: string) => {
    useSettings.getState().update({ playLayout: 'big' });
    openSong(id);
    go('play');
  };
  return (
    <section className="h-section h-split h-split-rev" aria-labelledby="learn-h">
      <div className="h-songs rv" data-ui>
        <div className="h-panel-bar">
          <b>Songs</b>
          <span className="faint">{SONGS.length} to learn</span>
        </div>
        {SONGS.slice(0, 7).map((s) => (
          <button key={s.id} className="h-song" onClick={() => start(s.id)}>
            <span className="h-song-main">
              <b>{s.title}</b>
              <span>
                {s.composer} · {s.hands.length > 1 ? 'both hands' : 'right hand'}
              </span>
            </span>
            {best[s.id] !== undefined ? (
              <span className="h-song-best">
                <Check size={13} /> {best[s.id]}%
              </span>
            ) : (
              <span className={`h-level l${s.level}`}>{LEVEL_LABEL[s.level]}</span>
            )}
          </button>
        ))}
      </div>
      <div className="h-copy rv">
        <h2 id="learn-h">Learn songs key by key</h2>
        <p>Pick a melody and the notes fall onto the piano, with the right key lit before you need it.</p>
        <dl className="h-modes">
          <div>
            <dt>Watch</dt>
            <dd>The song plays itself so you can see the shape of it.</dd>
          </div>
          <div>
            <dt>Wait</dt>
            <dd>Every note stops at the keyboard until you press it. No rush.</dd>
          </div>
          <div>
            <dt>Play</dt>
            <dd>The song keeps time and scores each note you hit.</dd>
          </div>
        </dl>
        <button className="btn primary lg" onClick={learn}>
          Learn a song <ArrowRight />
        </button>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- studio */

const RACK = [
  { name: 'Kick', midi: 36, steps: [0, 6, 8, 11] },
  { name: 'Snare', midi: 38, steps: [4, 12] },
  { name: 'Closed hat', midi: 42, steps: [0, 2, 4, 6, 8, 10, 12, 14] },
  { name: 'Open hat', midi: 46, steps: [7, 15] },
];
const BPM = 92;

function MiniRack() {
  const [grid, setGrid] = useState(() => RACK.map((r) => Array.from({ length: 16 }, (_, i) => r.steps.includes(i))));
  const [step, setStep] = useState(-1);
  const [on, setOn] = useState(false);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  useEffect(() => {
    if (!on) return;
    let voice: Voice | null = null;
    let next = 0;
    let i = 0;
    let stopped = false;
    const timers: number[] = [];
    void previewVoice('kit:standard-kit').then((v) => {
      if (stopped) return;
      voice = v;
      next = Tone.now() + 0.08;
    });
    const sixteenth = 60 / BPM / 4;
    const id = window.setInterval(() => {
      if (!voice) return;
      while (next < Tone.now() + 0.12) {
        const s = i;
        gridRef.current.forEach((row, r) => row[s] && voice!.play(RACK[r].midi, 0.2, next, s % 4 === 0 ? 0.9 : 0.7));
        timers.push(window.setTimeout(() => setStep(s), Math.max(0, (next - Tone.now()) * 1000)));
        i = (i + 1) % 16;
        next += sixteenth;
      }
    }, 25);
    return () => {
      stopped = true;
      clearInterval(id);
      timers.forEach(clearTimeout);
      setStep(-1);
    };
  }, [on]);

  return (
    <div className="h-rack rv" data-ui>
      <div className="h-panel-bar">
        <button className={`btn sm ${on ? 'on' : 'primary'}`} onClick={() => setOn(!on)}>
          {on ? <Pause /> : <Play />} {on ? 'Stop' : 'Play beat'}
        </button>
        <span className="h-lcd">{BPM} BPM</span>
        <span className="faint">Pattern 1 · tap a step to change the beat</span>
      </div>
      <div className="h-rack-rows">
        {RACK.map((r, ri) => (
          <div key={r.name} className="h-rack-row">
            <span className="h-rack-name">{r.name}</span>
            <div className="h-steps">
              {grid[ri].map((v, si) => (
                <button
                  key={si}
                  className={`h-step ${v ? 'on' : ''} ${si === step ? 'now' : ''} ${Math.floor(si / 4) % 2 ? 'alt' : ''}`}
                  aria-label={`${r.name} step ${si + 1}`}
                  aria-pressed={v}
                  onClick={() => setGrid((g) => g.map((row, i) => (i === ri ? row.map((x, j) => (j === si ? !x : x)) : row)))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const STUDIO_FEATURES = [
  ['Channel rack', 'Sixteen steps per bar for every drum and instrument, with velocity and swing.'],
  ['Piano roll', 'Draw melodies and chords with scale highlighting and other channels shown faintly behind.'],
  ['Playlist', 'Arrange patterns, recordings and automation clips into a whole song.'],
  ['Mixer', 'EQ, compression, sends and ten insert effects on every channel.'],
  ['Recording', 'Sing or play over the beat from your microphone, with a count-in.'],
  ['Export', 'WAV, MP3, one file per channel, or MIDI for another DAW.'],
];

function Studio() {
  return (
    <section className="h-section" aria-labelledby="studio-h">
      <div className="h-split h-split-top">
        <div className="h-copy rv">
          <h2 id="studio-h">A full studio when you have an idea</h2>
          <p>
            Built the way FL Studio works, so tutorials you already know still apply — and simple enough that the first beat takes a
            minute.
          </p>
          <a className="btn primary lg" href="#/studio">
            Open the studio <ArrowRight />
          </a>
        </div>
        <MiniRack />
      </div>
      <div className="h-features rv">
        {STUDIO_FEATURES.map(([t, d]) => (
          <div key={t}>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- themes */

function Themes() {
  const presetId = useSettings((s) => s.presetId);
  const apply = useSettings((s) => s.applyPreset);
  return (
    <section className="h-section" aria-labelledby="themes-h">
      <div className="h-copy h-copy-wide rv">
        <h2 id="themes-h">Make it look like yours</h2>
        <p>
          Try a theme — the whole app changes as you click. Every colour, the fonts and the look of each instrument can be changed in{' '}
          <a href="#/settings">Settings</a>.
        </p>
      </div>
      <div className="h-themes rv">
        {THEME_PRESETS.map((t) => (
          <button key={t.id} className={`h-theme ${presetId === t.id ? 'on' : ''}`} onClick={() => apply(t.id)} aria-pressed={presetId === t.id}>
            <span className="h-theme-swatch" style={{ background: t.colors.bg }}>
              <i style={{ background: t.colors.panel }} />
              <i style={{ background: t.colors.primary }} />
              <i style={{ background: t.colors.secondary }} />
            </span>
            <span className="h-theme-name">{t.name}</span>
            <span className="h-theme-note">{t.note}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- start */

function StartProject() {
  const [name, setName] = useState('My first beat');
  const [tpl, setTpl] = useState<'hiphop' | 'house' | 'empty'>('hiphop');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    const p = fromTemplate(tpl);
    p.name = name.trim() || 'Untitled';
    await startProject(p);
    go('studio');
  };
  return (
    <section className="h-section h-start" aria-labelledby="start-h">
      <div className="h-copy rv">
        <h2 id="start-h">Start a project now</h2>
        <p>Nothing to sign up for. Projects save in this browser as you work, and a session file takes them to another device.</p>
        <div className="h-install">
          <InstallButton className="btn lg" />
        </div>
      </div>
      <form
        className="h-dialog rv"
        data-ui
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        onKeyDown={(e: ReactKeyboardEvent) => e.stopPropagation()}
      >
        <h3>New project</h3>
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </label>
        <div className="field">
          <span className="field-label">Start from</span>
          <div className="seg" role="radiogroup">
            {(
              [
                ['hiphop', 'Hip-hop'],
                ['house', 'House'],
                ['empty', 'Empty'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={tpl === id} className={tpl === id ? 'on' : ''} onClick={() => setTpl(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button className="btn primary h-dialog-go" type="submit" disabled={busy}>
          Open in the studio <ArrowRight />
        </button>
      </form>
    </section>
  );
}

/* ----------------------------------------------------------------- page */

export function HomePage() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const count = INSTRUMENTS.length + KITS.length;

  return (
    <div className="home" ref={root}>
      <section className="h-hero">
        <div className="h-hero-copy">
          <h1>
            Play any instrument.
            <br />
            Finish the song.
          </h1>
          <p className="h-lede">
            {count} sampled instruments you play with your computer keyboard, songs that teach you the keys, and a studio for beats and
            vocals. Free, in your browser.
          </p>
          <div className="h-actions">
            <a className="btn primary lg" href="#/play">
              Start playing <ArrowRight />
            </a>
            <a className="btn lg" href="#/studio">
              Open the studio
            </a>
          </div>
          <p className="h-facts">No sign-up · Works offline once installed · MIDI keyboards supported</p>
        </div>
        <HeroWindow />
      </section>

      <Instruments />
      <Learn />
      <Studio />
      <Themes />
      <StartProject />

      <footer className="h-foot">
        <span>Sonare — instruments, lessons and a studio in your browser</span>
        <nav>
          <a href="#/play">Play</a>
          <a href="#/studio">Studio</a>
          <a href="#/settings">Settings</a>
        </nav>
      </footer>
    </div>
  );
}
