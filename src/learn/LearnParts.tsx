import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Pause, Play, RotateCcw, X } from 'lucide-react';
import { Range, Segmented } from '../components/ui';
import { useMobile } from '../lib/useMobile';
import { Keyboard, keyGeometry } from '../components/instruments/Keyboard';
import { noteOff, noteOn, useLive } from '../audio/live';
import { pianoKeyLabels } from '../audio/input';
import { useSettings } from '../theme/settings';
import { isBlack, noteName } from '../lib/notes';
import { LEVEL_LABEL, SONGS, songById, type Song } from './songs';
import {
  accuracy,
  closeSong,
  isUserNote,
  judgement,
  lessonPos,
  lessonSong,
  openSong,
  pauseLesson,
  playLesson,
  restartLesson,
  seekLesson,
  setLesson,
  useLesson,
  type HandSel,
  type LessonMode,
} from './lesson';

/* ------------------------------------------------------------ key range */

function whiteFloor(m: number) {
  while (isBlack(m)) m--;
  return m;
}
function whiteCeil(m: number) {
  while (isBlack(m)) m++;
  return m;
}
function whitesIn(a: number, b: number) {
  let n = 0;
  for (let m = a; m <= b; m++) if (!isBlack(m)) n++;
  return n;
}

/** Keys to show for a song: its whole range, widened to at least `fit` white keys. */
export function songRange(song: Song, fit: number): [number, number] {
  let lo = whiteFloor(Math.min(...song.notes.map((n) => n.pitch)) - 1);
  let hi = whiteCeil(Math.max(...song.notes.map((n) => n.pitch)) + 1);
  let flip = false;
  while (whitesIn(lo, hi) < fit && (lo > 21 || hi < 108)) {
    if ((flip && lo > 21) || hi >= 108) lo = whiteFloor(lo - 1);
    else hi = whiteCeil(hi + 1);
    flip = !flip;
  }
  return [Math.max(21, lo), Math.min(108, hi)];
}

/* -------------------------------------------------------- falling notes */

function cssVar(el: Element, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Notes falling onto the keyboard below; lined up with the keys from `low` to `high`. */
export function FallingNotes({ low, high }: { low: number; high: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const songId = useLesson((s) => s.songId);
  // phones have no letter keys, so notes carry their names instead
  const mobile = useMobile();
  const keycaps = useSettings((s) => s.bigKeycaps) && !mobile;
  const keymap = useSettings((s) => s.keymap);
  const octave = useLive((s) => s.octave);
  const geo = useMemo(() => keyGeometry(low, high), [low, high]);
  const labels = useMemo(() => (keycaps ? pianoKeyLabels(octave, keymap) : null), [keycaps, octave, keymap]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !songId) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let colours = { r: '', l: '', text: '', grid: '', faint: '', bad: '', bg: '' };
    let coloursAt = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const song = lessonSong();
      if (!song) return;
      if (now - coloursAt > 800) {
        coloursAt = now;
        colours = {
          r: cssVar(canvas, '--primary', '#e3a043'),
          l: cssVar(canvas, '--secondary', '#7fb0a6'),
          text: cssVar(canvas, '--text', '#ebe7df'),
          grid: cssVar(canvas, '--border', '#2a2b30'),
          faint: cssVar(canvas, '--text-faint', '#6a6760'),
          bad: cssVar(canvas, '--danger', '#e5534b'),
          bg: cssVar(canvas, '--bg', '#0f1012'),
        };
      }
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const pos = lessonPos();
      const ppb = Math.max(34, Math.min(150, H / 4.5));
      const yOf = (beat: number) => H - (beat - pos) * ppb;

      // octave lanes and bar lines
      ctx.fillStyle = colours.grid;
      for (const [m, g] of geo) if (m % 12 === 0) ctx.fillRect(Math.round(g.left * W), 0, 1, H);
      ctx.globalAlpha = 0.7;
      const firstBar = Math.ceil(pos / song.beatsPerBar) * song.beatsPerBar;
      for (let b = firstBar; yOf(b) > 0; b += song.beatsPerBar) ctx.fillRect(0, Math.round(yOf(b)), W, 1);
      ctx.globalAlpha = 1;

      ctx.font = `600 11px ${cssVar(canvas, '--font-mono', 'monospace')}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const n of song.notes) {
        const yb = yOf(n.start);
        const yt = yOf(n.start + n.dur);
        if (yt > H) continue;
        if (yb < 0) break;
        const g = geo.get(n.pitch);
        if (!g) continue;
        const user = isUserNote(n);
        const j = judgement(n);
        const x = g.left * W + 1.5;
        const w = g.width * W - 3;
        const h = Math.max(6, yb - yt - 2);
        const colour = n.hand === 'L' ? colours.l : colours.r;
        const sounding = pos >= n.start && pos < n.start + n.dur;
        ctx.globalAlpha = !user ? 0.32 : j === 1 ? 0.45 : sounding ? 1 : 0.9;
        roundRect(ctx, x, yt + 1, w, h, 4);
        ctx.fillStyle = j === 2 ? colours.faint : colour;
        ctx.fill();
        if (j === 2) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = colours.bad;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (user && w > 13 && h > 18 && j !== 1) {
          ctx.fillStyle = colours.bg;
          const text = labels?.get(n.pitch)?.toUpperCase() ?? noteName(n.pitch, false);
          ctx.fillText(text, x + w / 2, Math.min(H - 4, yb - 4));
        }
      }

      // the line the notes land on
      ctx.fillStyle = useLesson.getState().waiting ? colours.r : colours.faint;
      ctx.fillRect(0, H - 2, W, 2);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [songId, geo, labels]);

  return <canvas ref={ref} className="falling" aria-hidden />;
}

/* ---------------------------------------------------------- song picker */

export function SongPicker() {
  const songId = useLesson((s) => s.songId);
  const best = useLesson((s) => s.best);
  const levels = [1, 2, 3] as const;
  return (
    <div className="song-picker">
      {levels.map((lv) => (
        <section key={lv}>
          <h5 className="eyebrow">{LEVEL_LABEL[lv]}</h5>
          {SONGS.filter((s) => s.level === lv).map((s) => (
            <button key={s.id} className={`song-row ${s.id === songId ? 'on' : ''}`} onClick={() => openSong(s.id)}>
              <span className="song-row-main">
                <span className="song-title">{s.title}</span>
                <span className="song-meta faint">
                  {s.composer} · {s.hands.length > 1 ? 'both hands' : 'right hand'}
                </span>
              </span>
              {best[s.id] !== undefined && (
                <span className="song-best mono" title="Your best accuracy">
                  {best[s.id] >= 95 && <Check size={12} />}
                  {best[s.id]}%
                </span>
              )}
            </button>
          ))}
        </section>
      ))}
      <p className="faint song-note">All melodies are traditional or public-domain arrangements.</p>
    </div>
  );
}

/* ----------------------------------------------------------- lesson bar */

function Progress() {
  const ref = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const s = lessonSong();
      if (s && fill.current) fill.current.style.width = `${Math.max(0, Math.min(1, lessonPos() / s.length)) * 100}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const seek = (clientX: number) => {
    const s = lessonSong();
    const r = ref.current?.getBoundingClientRect();
    if (!s || !r) return;
    seekLesson(((clientX - r.left) / r.width) * s.length);
  };
  return (
    <div
      ref={ref}
      className="lesson-progress"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        seek(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && seek(e.clientX)}
      title="Drag to jump through the song"
    >
      <div ref={fill} className="lesson-progress-fill" />
    </div>
  );
}

export function LessonBar({ onPickSong }: { onPickSong: () => void }) {
  const l = useLesson();
  const song = l.songId ? songById(l.songId) : undefined;
  if (!song) return null;
  const two = song.hands.length > 1;
  return (
    <div className="lesson-bar">
      <button className="btn lesson-song" onClick={onPickSong} title="Choose another song">
        <span className="lesson-song-name">{song.title}</span>
        <ChevronDown />
      </button>
      <Segmented<LessonMode>
        value={l.mode}
        onChange={(v) => setLesson({ mode: v })}
        options={[
          { value: 'watch', label: 'Watch', title: 'The song plays itself' },
          { value: 'wait', label: 'Wait', title: 'Notes wait until you press the right keys' },
          { value: 'play', label: 'Play', title: 'Keep time with the song — notes are scored' },
        ]}
      />
      {two && l.mode !== 'watch' && (
        <Segmented<HandSel>
          value={l.hands}
          onChange={(v) => setLesson({ hands: v })}
          options={[
            { value: 'R', label: 'Right', title: 'You play the right hand, the left is played for you' },
            { value: 'L', label: 'Left', title: 'You play the left hand, the right is played for you' },
            { value: 'both', label: 'Both' },
          ]}
        />
      )}
      <div className="lesson-speed" title="Speed — double-click the value for 100%">
        <span className="field-label">Speed</span>
        <Range value={l.speed} min={0.3} max={1.3} step={0.05} onChange={(v) => setLesson({ speed: Math.round(v * 20) / 20 })} ariaLabel="Speed" />
        <span className="mono" onDoubleClick={() => setLesson({ speed: 1 })}>
          {Math.round(l.speed * 100)}%
        </span>
      </div>
      <Progress />
      {l.mode !== 'watch' && (
        <span className="lesson-score" title="Accuracy and current streak">
          <span className="faint">Score</span> <b className="mono">{l.hits + l.misses ? `${accuracy()}%` : '—'}</b>
          {l.streak > 2 && <span className="faint"> · {l.streak} in a row</span>}
        </span>
      )}
      <div className="lesson-actions">
        <button className="btn icon" onClick={restartLesson} title="Start again">
          <RotateCcw />
        </button>
        <button className="btn primary lesson-play" onClick={() => (l.playing ? pauseLesson() : playLesson())}>
          {l.playing ? <Pause /> : <Play />}
          {l.playing ? 'Pause' : l.finished ? 'Again' : 'Play'}
        </button>
        <button className="btn icon ghost" onClick={closeSong} title="Close the song">
          <X />
        </button>
      </div>
    </div>
  );
}

/** Shown over the falling notes before starting and after the last note. */
export function LessonOverlay() {
  const l = useLesson();
  const song = l.songId ? songById(l.songId) : undefined;
  if (!song || l.playing) return null;
  const next = SONGS[(SONGS.findIndex((s) => s.id === song.id) + 1) % SONGS.length];
  if (l.finished)
    return (
      <div className="lesson-overlay">
        <div className="lesson-card">
          <span className="eyebrow">Finished</span>
          <h3>{song.title}</h3>
          {l.mode !== 'watch' && (
            <p className="lesson-result mono">
              <b>{accuracy()}%</b> accuracy · best streak {l.bestStreak}
            </p>
          )}
          <div className="row">
            <button className="btn primary" onClick={playLesson}>
              <RotateCcw /> Play again
            </button>
            <button className="btn" onClick={() => openSong(next.id)}>
              Next: {next.title}
            </button>
          </div>
        </div>
      </div>
    );
  return (
    <div className="lesson-overlay">
      <div className="lesson-card">
        <span className="eyebrow">
          {song.composer} · {LEVEL_LABEL[song.level]}
        </span>
        <h3>{song.title}</h3>
        <p className="muted">
          {l.mode === 'watch' && 'Sit back and watch which keys to press.'}
          {l.mode === 'wait' && 'The notes stop at the keyboard until you press the lit keys. Take your time.'}
          {l.mode === 'play' && 'The song keeps going — press each key as its note lands.'}
        </p>
        <button className="btn primary" onClick={playLesson}>
          <Play /> Start
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------- stand-alone lesson stage */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(800);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Falling notes over a keyboard sized to the song — used on phones. */
export function LessonStage({ onPickSong }: { onPickSong: () => void }) {
  const songId = useLesson((s) => s.songId);
  const hint = useLesson((s) => s.hint);
  const active = useLive((s) => s.active);
  const skin = useSettings((s) => s.skins.keyboard);
  const [ref, width] = useWidth<HTMLDivElement>();
  const song = songId ? songById(songId) : undefined;
  const [low, high] = useMemo(() => (song ? songRange(song, Math.max(10, Math.floor(width / 34))) : [48, 72]), [song, width]);
  if (!song) return null;
  return (
    <div className="lesson-stage" ref={ref}>
      <LessonBar onPickSong={onPickSong} />
      <div className="lesson-fall">
        <FallingNotes low={low} high={high} />
        <LessonOverlay />
      </div>
      <div className="lesson-keys">
        <Keyboard
          low={low}
          high={high}
          active={active}
          onDown={(m, v) => noteOn(m, v)}
          onUp={(m) => noteOff(m)}
          skin={skin}
          showCase={false}
          className="kb-flat"
          height={150}
          labels="c"
          hinted={hint}
        />
      </div>
    </div>
  );
}
