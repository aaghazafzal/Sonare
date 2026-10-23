import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import * as Tone from 'tone';
import { Keyboard } from '../components/instruments/Keyboard';
import { InstallButton } from '../components/ui';
import { noteOff, noteOn, useLive, liveStrip } from '../audio/live';
import { Voice, ensureAudio } from '../audio/engine';
import { pianoKeyLabels } from '../audio/input';
import { useSettings } from '../theme/settings';
import { setLesson } from '../learn/lesson';
import { SONGS } from '../learn/songs';
import { fromTemplate } from '../studio/store';
import { startProject } from '../studio/projects';
import { INSTRUMENTS, KITS } from '../lib/instruments';
import { useMobile } from '../lib/useMobile';
import { noteName } from '../lib/notes';

/* -------------------------------------------------------------- content */

type Phrase = [midi: number, beat: number, beats: number][];

const EXHIBITS: {
  id: string;
  name: string;
  text: string;
  photo: string;
  caption: string;
  tone: string;
  bpm: number;
  phrase: Phrase;
}[] = [
  {
    id: 'jazz-piano',
    name: 'Jazz Piano',
    text: 'One of 13 pianos, from a concert grand to a honky-tonk upright.',
    photo: '/home/piano-tatum.jpg',
    caption: 'Art Tatum at the Vogue Room, New York, 1948',
    tone: 'a',
    bpm: 96,
    phrase: [
      [50, 0, 2], [53, 0, 2], [57, 0, 2], [60, 0, 2], [64, 0, 2],
      [43, 2, 2], [53, 2, 2], [57, 2, 2], [59, 2, 2], [64, 2, 2],
      [48, 4, 4], [52, 4, 4], [55, 4, 4], [59, 4, 4], [62, 4, 4],
    ],
  },
  {
    id: 'jazz-guitar',
    name: 'Jazz Guitar',
    text: 'Fourteen guitars and plucked strings — nylon, steel, oud, sitar, koto.',
    photo: '/home/guitar-reinhardt.jpg',
    caption: 'Django Reinhardt, New York, 1946',
    tone: 'b',
    bpm: 132,
    phrase: [
      [55, 0, 1], [59, 1, 1], [62, 2, 1], [66, 3, 1], [69, 4, 1.5], [67, 5.5, 0.5], [66, 6, 1], [64, 7, 1], [62, 8, 3],
    ],
  },
  {
    id: 'kit:standard-kit',
    name: 'Standard Kit',
    text: 'Six drum kits on the pads, the keyboard and the step sequencer.',
    photo: '/home/drums-krupa.jpg',
    caption: 'Gene Krupa, around 1946',
    tone: 'c',
    bpm: 112,
    phrase: [
      [36, 0, 0.5], [51, 0, 0.5], [51, 1, 0.5], [38, 1, 0.5], [51, 1.66, 0.3], [51, 2, 0.5], [36, 2, 0.5],
      [51, 3, 0.5], [38, 3, 0.5], [51, 3.66, 0.3], [36, 4, 0.5], [51, 4, 0.5], [38, 5, 0.5], [51, 5, 0.5],
      [38, 5.5, 0.3], [38, 5.75, 0.3], [49, 6, 1], [36, 6, 1],
    ],
  },
  {
    id: 'muted-trumpet',
    name: 'Muted Trumpet',
    text: 'Eight brass and ten reeds, with a breath of room around them.',
    photo: '/home/band-gillespie.jpg',
    caption: 'Dizzy Gillespie and his orchestra, New York, 1946–48',
    tone: 'd',
    bpm: 150,
    phrase: [
      [67, 0, 0.5], [70, 0.5, 0.5], [72, 1, 0.5], [74, 1.5, 0.5], [75, 2, 1], [74, 3, 0.5], [72, 3.5, 0.5], [70, 4, 0.5], [67, 4.5, 2.5],
    ],
  },
  {
    id: 'voice-oohs',
    name: 'Voice Oohs',
    text: 'Choirs to sing over, and a microphone input for your own voice.',
    photo: '/home/voice-holiday.jpg',
    caption: 'Billie Holiday at the Downbeat, New York, 1947',
    tone: 'e',
    bpm: 70,
    phrase: [
      [57, 0, 2], [60, 0, 2], [64, 0, 2], [53, 2, 2], [57, 2, 2], [60, 2, 2], [52, 4, 3], [55, 4, 3], [60, 4, 3],
    ],
  },
];

const COMMANDS: { name: string; text: string; keys?: string[]; go: () => void }[] = [
  { name: 'Play the piano', text: 'Q to P and Z to slash are white keys; the row above each is black.', keys: ['Q', 'W', 'E'], go: () => go('play') },
  { name: 'Hold the sustain pedal', text: 'Hold Space while you play, like the right pedal of a piano.', keys: ['␣'], go: () => go('play') },
  { name: 'Move up an octave', text: 'Arrow keys move the keyboard; up and down change how hard you play.', keys: ['←', '→'], go: () => go('play') },
  { name: 'Learn a song', text: `${SONGS.length} classics with falling notes that wait for you.`, go: () => learn() },
  { name: 'Program a beat', text: 'The channel rack: sixteen steps per bar, velocity on every step.', keys: ['F6'], go: () => go('studio') },
  { name: 'Write a melody', text: 'The piano roll, with scale highlighting and ghost notes from other channels.', keys: ['F7'], go: () => go('studio') },
  { name: 'Mix with effects', text: 'Ten insert effects per channel, sends, and automation clips.', keys: ['F9'], go: () => go('studio') },
  { name: 'Record a vocal', text: 'Arm an audio channel and sing over your beat; takes land on the playlist.', go: () => go('studio') },
  { name: 'Export the song', text: 'WAV, MP3, one file per channel, or MIDI for another DAW.', go: () => go('studio') },
  { name: 'Change every colour', text: 'Eight themes, seven fonts, and a colour picker for every part of the screen.', go: () => go('settings') },
];

const go = (r: 'play' | 'studio' | 'settings') => {
  location.hash = `#/${r}`;
};
const learn = () => {
  useSettings.getState().update({ playLayout: 'big' });
  setLesson({ pickerOpen: true });
  go('play');
};

/* -------------------------------------------------------------- sounds */

let preview: Voice | null = null;
async function playPhrase(id: string, bpm: number, phrase: Phrase) {
  await ensureAudio();
  preview ??= new Voice(liveStrip.input);
  await preview.setInstrument(id);
  const beat = 60 / bpm;
  const t0 = Tone.now() + 0.05;
  for (const [m, b, d] of phrase) preview.play(m, d * beat * 0.95, t0 + b * beat, 0.75);
  return (Math.max(...phrase.map(([, b, d]) => b + d)) * beat + 0.4) * 1000;
}

/* ------------------------------------------------------------ sections */

function HeroKeys() {
  const active = useLive((s) => s.active);
  const octave = useLive((s) => s.octave);
  const keymap = useSettings((s) => s.keymap);
  const skin = useSettings((s) => s.skins.keyboard);
  const labels = useMemo(() => pianoKeyLabels(octave, keymap), [octave, keymap]);
  // phones have no letter keys to print on the piano
  const touch = !!useMobile();
  return (
    <div className="home-keys">
      <Keyboard
        low={60}
        high={83}
        active={active}
        onDown={(m, v) => noteOn(m, v)}
        onUp={(m) => noteOff(m)}
        skin={skin}
        showCase={false}
        className="kb-flat"
        height={150}
        renderLabel={(m, black) =>
          touch ? (
            m % 12 === 0 && <span className="wk-name">{noteName(m)}</span>
          ) : (
            labels.get(m) && <span className={`keycap ${black ? 'on-black' : ''}`}>{labels.get(m)}</span>
          )
        }
      />
    </div>
  );
}

function Exhibits({ scroller }: { scroller: React.RefObject<HTMLDivElement | null> }) {
  const wrap = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  // the cards cross the held photograph as the page scrolls
  useEffect(() => {
    const sc = scroller.current;
    const w = wrap.current;
    const t = track.current;
    if (!sc || !w || !t) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 760px)');
    let raf = 0;
    const update = () => {
      raf = 0;
      if (still.matches) {
        t.style.transform = '';
        return;
      }
      const span = w.offsetHeight - sc.clientHeight;
      const p = Math.max(0, Math.min(1, (sc.scrollTop - w.offsetTop) / Math.max(1, span)));
      const travel = t.scrollWidth - w.clientWidth + 64;
      t.style.transform = `translateX(${-p * Math.max(0, travel)}px)`;
    };
    const on = () => (raf ||= requestAnimationFrame(update));
    sc.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    update();
    return () => {
      sc.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
    };
  }, [scroller]);

  const play = async (e: (typeof EXHIBITS)[number]) => {
    setPlaying(e.id);
    const ms = await playPhrase(e.id, e.bpm, e.phrase);
    setTimeout(() => setPlaying((p) => (p === e.id ? null : p)), ms);
  };

  return (
    <section className="home-exhibits" ref={wrap} aria-labelledby="exhibits-h">
      <div className="home-exhibits-stage">
        <img className="home-exhibits-ground" src="/home/band-gillespie.jpg" alt="" width={1100} height={823} loading="lazy" />
        <h2 id="exhibits-h" className="home-h2 home-exhibits-title rv">
          Real recordings,
          <br />
          not beeps
        </h2>
        <div className="home-exhibits-track" ref={track}>
          {EXHIBITS.map((e) => (
            <article key={e.id} className={`home-card tone-${e.tone}`}>
              <figure>
                <img src={e.photo} alt={e.caption} width={1000} height={1100} loading="lazy" />
                <figcaption>{e.caption}</figcaption>
              </figure>
              <div className="home-card-panel">
                <div>
                  <h3>{e.name}</h3>
                  <p>{e.text}</p>
                </div>
                <button className={`home-play ${playing === e.id ? 'on' : ''}`} onClick={() => void play(e)} aria-label={`Hear the ${e.name}`}>
                  <Play size={16} /> {playing === e.id ? 'Playing' : 'Hear it'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Commands() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const list = COMMANDS.filter((c) => (c.name + ' ' + c.text).toLowerCase().includes(q.trim().toLowerCase()));
  const cur = Math.min(sel, Math.max(0, list.length - 1));
  const onKey = (e: ReactKeyboardEvent) => {
    // keep the piano from playing while typing here
    e.stopPropagation();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((cur + 1) % Math.max(1, list.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((cur - 1 + list.length) % Math.max(1, list.length));
    } else if (e.key === 'Enter') list[cur]?.go();
  };
  return (
    <section className="home-commands" aria-labelledby="commands-h" data-ui>
      <h2 id="commands-h" className="home-h2 rv">
        Everything it does
      </h2>
      <input
        className="home-search rv"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={onKey}
        placeholder="Find what you want to do"
        aria-label="Find what you want to do"
        aria-controls="home-command-list"
      />
      <ul id="home-command-list" className="home-command-list" role="listbox">
        {list.map((c, i) => (
          <li key={c.name} role="option" aria-selected={i === cur} className={i === cur ? 'on' : ''} onMouseEnter={() => setSel(i)}>
            <button onClick={c.go} onFocus={() => setSel(i)}>
              <span className="home-command-name">{c.name}</span>
              {c.keys && (
                <span className="home-caps" aria-hidden>
                  {c.keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
              )}
            </button>
            {i === cur && <p>{c.text}</p>}
          </li>
        ))}
        {!list.length && <li className="home-command-none">Nothing matches “{q}”.</li>}
      </ul>
    </section>
  );
}

function Ways() {
  return (
    <section className="home-ways" aria-labelledby="ways-h">
      <h2 id="ways-h" className="home-h2 rv">
        Three ways in
      </h2>
      <figure className="home-way way-1 rv">
        <img src="/home/piano-williams.jpg" alt="Mary Lou Williams at the piano, New York, around 1946" width={826} height={1100} loading="lazy" />
      </figure>
      <p className="home-way-text text-1 rv">
        <b>Open it and play.</b> Nothing to sign up for or install. Your letters are piano keys: Q to P and Z to slash are the white keys, the
        row above each holds the black ones. A MIDI keyboard works too, and so does a touch screen.
      </p>
      <figure className="home-way way-2 rv">
        <img src="/home/voice-holiday.jpg" alt="Billie Holiday singing at the Downbeat club, New York, 1947" width={1054} height={1100} loading="lazy" />
      </figure>
      <p className="home-way-text text-2 rv">
        <b>When a song catches you,</b> pick it from {SONGS.length} classics — {SONGS.slice(4, 8).map((s) => s.title).join(', ')}. Notes fall
        onto the keys and wait until you press them. Slow it to a third of the speed, then bring it back up.
      </p>
      <figure className="home-way way-3 rv">
        <img src="/home/drums-krupa.jpg" alt="Gene Krupa at his drum kit, around 1946" width={862} height={1100} loading="lazy" />
      </figure>
      <p className="home-way-text text-3 rv">
        <b>When you have an idea,</b> open the studio: drums in the step sequencer, chords in the piano roll, your voice on its own track and
        effects on the mixer. Export a WAV or an MP3 when it is done.
      </p>
    </section>
  );
}

function StartProject() {
  const [name, setName] = useState('Late night sketch');
  const [tpl, setTpl] = useState<'hiphop' | 'house'>('hiphop');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    const p = fromTemplate(tpl);
    p.name = name.trim() || 'Untitled';
    await startProject(p);
    go('studio');
  };
  return (
    <section className="home-start" aria-labelledby="start-h">
      <div className="home-start-words">
        <h2 id="start-h" className="home-h2-xl">
          Start a beat
          <br />
          right now
        </h2>
        <p>It opens in the studio with drums, bass and keys already in place. Everything saves in this browser as you work.</p>
      </div>
      <form
        className="home-dialog"
        data-ui
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        onKeyDown={(e) => e.stopPropagation()}
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
                ['hiphop', 'Hip-hop · 88 BPM'],
                ['house', 'House · 124 BPM'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={tpl === id} className={tpl === id ? 'on' : ''} onClick={() => setTpl(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button className="btn primary home-dialog-go" type="submit" disabled={busy}>
          Open in the studio <ArrowRight />
        </button>
      </form>
    </section>
  );
}

/* ----------------------------------------------------------------- page */

export function HomePage() {
  const scroller = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLHeadingElement>(null);
  const count = INSTRUMENTS.length + KITS.length;
  const mobile = useMobile();

  // entrances and the wordmark that settles as the first screen leaves
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    sc.classList.add('js');
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { root: sc, threshold: 0.15 },
    );
    sc.querySelectorAll('.rv').forEach((el) => io.observe(el));
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    const onScroll = () =>
      (raf ||= requestAnimationFrame(() => {
        raf = 0;
        if (!mark.current || still.matches) return;
        const p = Math.min(1, sc.scrollTop / Math.max(1, sc.clientHeight));
        mark.current.style.scale = String(1 - p * 0.07);
      }));
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      sc.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="home" ref={scroller}>
      <section className="home-hero">
        <figure className="home-hero-photo">
          <img src="/home/piano-williams.jpg" alt="Mary Lou Williams at the piano, New York, around 1946" width={826} height={1100} fetchPriority="high" />
        </figure>
        <div className="home-hero-side">
          <p className="home-lede">
            Play {count} real instruments from your computer keyboard, learn songs as you go, and finish them in a studio. Free, in your
            browser.
          </p>
          <div className="home-actions">
            <a className="home-cta" href="#/play">
              Start playing <ArrowRight />
            </a>
            <a className="home-link" href="#/studio">
              Open the studio
            </a>
            <button className="home-link" onClick={learn}>
              Learn a song
            </button>
          </div>
          <HeroKeys />
          <p className="home-keys-note">{mobile ? 'These keys play — tap them.' : 'These keys play — press the letters on them, or tap.'}</p>
        </div>
        <h1 className="home-mark" ref={mark}>
          sonare
        </h1>
      </section>

      <Exhibits scroller={scroller} />
      <Commands />
      <Ways />
      <StartProject />

      <footer className="home-foot">
        <span>Instruments and a studio in your browser</span>
        <nav>
          <a href="#/play">Play</a>
          <a href="#/studio">Studio</a>
          <a href="#/settings">Settings</a>
          <InstallButton className="home-foot-install" />
        </nav>
        <span>
          Photographs by William P. Gottlieb, public domain, via the Library of Congress and Wikimedia Commons · {new Date().getFullYear()}
        </span>
      </footer>
    </div>
  );
}
