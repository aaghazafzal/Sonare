import { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Ghost, Lock, Magnet, MousePointerClick, Wand2, ZoomIn } from 'lucide-react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useStudio, mapPattern, mapItem, setChannelNotes, uid, currentPattern } from './store';
import { audition, currentBeat } from './playback';
import type { AudioItem, Note, Pattern, Track } from './types';
import { DRUM_PIECES } from '../lib/instruments';
import { inScale, isBlack, noteName, NOTE_NAMES, pitchClass, SCALES } from '../lib/notes';
import { Range } from '../components/ui';
import { AutomationEditor } from './AutomationEditor';

const VEL_H = 64;

/** Piano-roll helpers that stay between sessions. */
const useRollPrefs = create<{ root: number; scale: string; lock: boolean; ghosts: boolean; set: (p: Partial<{ root: number; scale: string; lock: boolean; ghosts: boolean }>) => void }>()(
  persist((set) => ({ root: 0, scale: 'off', lock: false, ghosts: true, set: (p) => set(p) }), { name: 'sonare.roll' }),
);
const SNAPS = [
  { v: 1, label: '1/4' },
  { v: 0.5, label: '1/8' },
  { v: 0.25, label: '1/16' },
  { v: 1 / 3, label: '1/8T' },
  { v: 0.125, label: '1/32' },
  { v: 0, label: 'Off' },
];

/** Dock panel: the piano roll for the current pattern and selected channel (or the selected audio clip). */
export function PianoRollPanel() {
  const s = useStudio();
  const p = s.project;
  const item = p.playlist.find((x) => x.id === s.selectedItemId);
  if (item?.kind === 'audio') return <AudioItemPanel item={item} />;
  if (item?.kind === 'automation') return <AutomationEditor key={item.id} item={item} />;
  const pattern = currentPattern(p);
  const channels = p.tracks.filter((t) => t.kind !== 'audio');
  const track = channels.find((t) => t.id === s.selectedTrackId) ?? channels[0];
  if (!track || !pattern)
    return (
      <div className="empty editor-empty">
        <MousePointerClick size={22} />
        <div>Add an instrument channel to start writing notes.</div>
      </div>
    );
  return <PianoRoll key={pattern.id + track.id} track={track} pattern={pattern} channels={channels} />;
}

function AudioItemPanel({ item }: { item: AudioItem }) {
  const s = useStudio();
  const ch = s.project.tracks.find((t) => t.id === item.channelId);
  const sec = (item.length * 60) / s.project.bpm;
  return (
    <div className="audio-editor">
      <div className="pr-toolbar">
        {ch && (
          <span className="tag" style={{ borderColor: ch.color, color: ch.color }}>
            {ch.name}
          </span>
        )}
        <b>{item.name}</b>
        <span className="faint mono">
          {sec.toFixed(2)}s · starts {item.offset.toFixed(2)}s into the recording
        </span>
        <div className="spacer" />
        <span className="field-label">Clip gain</span>
        <div style={{ width: 160 }}>
          <Range value={item.gain} min={0} max={2} step={0.01} onChange={(g) => s.edit((p) => mapItem(p, item.id, (c) => ({ ...c, gain: g })), false)} />
        </div>
        <span className="mono faint">{(20 * Math.log10(Math.max(0.0001, item.gain))).toFixed(1)} dB</span>
      </div>
      <div className="empty faint">
        Drag the clip edges on the playlist to trim · Alt-drag to copy · right-click to delete. Effects for this channel are in the Mixer.
      </div>
    </div>
  );
}

type NoteDrag = {
  mode: 'move' | 'resize' | 'marquee' | 'paint' | 'erase' | 'vel';
  x0: number;
  y0: number;
  orig: Note[];
  anchorId?: string;
  moved: boolean;
  lastPitch?: number;
};

function PianoRoll({ track, pattern, channels }: { track: Track; pattern: Pattern; channels: Track[] }) {
  const s = useStudio();
  const notes = pattern.notes[track.id] ?? [];
  const len = pattern.length;
  const prefs = useRollPrefs();
  const scaleOn = prefs.scale !== 'off' && track.kind !== 'drums';
  /** with scale lock on, notes land on the nearest pitch of the scale */
  const fitScale = (pitch: number) => {
    if (!scaleOn || !prefs.lock || inScale(pitch, prefs.root, prefs.scale)) return pitch;
    for (let d = 1; d < 12; d++) {
      if (inScale(pitch - d, prefs.root, prefs.scale)) return pitch - d;
      if (inScale(pitch + d, prefs.root, prefs.scale)) return pitch + d;
    }
    return pitch;
  };
  // other channels in this pattern, drawn faintly behind the notes
  const ghosts = prefs.ghosts && track.kind !== 'drums' ? channels.filter((c) => c.id !== track.id && c.kind === 'instrument').flatMap((c) => (pattern.notes[c.id] ?? []).map((n) => ({ ...n, color: c.color }))) : [];
  const drums = track.kind === 'drums';
  const [ppb, setPpb] = useState(() => (len <= 4 ? 120 : len <= 8 ? 72 : 44));
  const [snap, setSnap] = useState(0.25);
  const [noteLen, setNoteLen] = useState(drums ? 0.25 : 1);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const velRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLDivElement>(null);
  const drag = useRef<NoteDrag | null>(null);
  const sel = new Set(s.selectedNotes);

  const rows = useMemo(() => {
    if (drums) return DRUM_PIECES.map((p) => p.midi);
    const out: number[] = [];
    for (let m = 108; m >= 21; m--) out.push(m);
    return out;
  }, [drums]);
  const ROW_H = drums ? 26 : 14;
  const KEYW = drums ? 104 : 64;
  const W = len * ppb;
  const H = rows.length * ROW_H;
  const rowOf = (pitch: number) => rows.indexOf(pitch);

  // initial vertical scroll: centre on the notes, or C4
  useEffect(() => {
    const el = mainRef.current;
    if (!el || drums) return;
    const pitches = notes.map((n) => n.pitch);
    const mid = pitches.length ? (Math.min(...pitches) + Math.max(...pitches)) / 2 : 62;
    el.scrollTop = rowOf(Math.round(mid)) * ROW_H - el.clientHeight / 2;
  }, []);

  // pattern-relative playhead: the looping pattern, or wherever this pattern sits on the playlist
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const st = useStudio.getState();
      const pr = st.project;
      let b = -1;
      if (st.playing) {
        const now = currentBeat();
        if (pr.mode === 'pattern') b = pr.currentPatternId === pattern.id ? now : -1;
        else {
          const it = pr.playlist.find((x) => x.kind === 'pattern' && x.patternId === pattern.id && now >= x.start && now < x.start + x.length);
          if (it) b = (now - it.start) % len;
        }
      }
      if (playRef.current) {
        playRef.current.style.display = b >= 0 && b <= len ? 'block' : 'none';
        playRef.current.style.transform = `translateX(${b * ppb}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pattern.id, len, ppb]);

  const setNotes = (fn: (notes: Note[]) => Note[], record = true) =>
    s.edit((p) => setChannelNotes(p, pattern.id, track.id, fn), record);
  const select = (ids: string[]) => s.setUi({ selectedNotes: ids });

  const posAt = (clientX: number, clientY: number) => {
    const r = gridRef.current!.getBoundingClientRect();
    const beat = (clientX - r.left) / ppb;
    const row = Math.floor((clientY - r.top) / ROW_H);
    return { beat, row: Math.max(0, Math.min(rows.length - 1, row)), x: clientX - r.left, y: clientY - r.top };
  };
  const snapB = (b: number) => (snap > 0 ? Math.floor(b / snap + 1e-6) * snap : b);
  const roundB = (b: number) => (snap > 0 ? Math.round(b / snap) * snap : b);

  const onGridDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    mainRef.current?.focus({ preventScroll: true });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { beat, row, x, y } = posAt(e.clientX, e.clientY);
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-note]');
    const noteId = target?.dataset.note;

    if (drums) {
      const step = snapB(beat);
      const pitch = rows[row];
      const existing = notes.find((n) => n.pitch === pitch && Math.abs(n.start - step) < 1e-3);
      s.checkpoint();
      if (existing) {
        setNotes((ns) => ns.filter((n) => n.id !== existing.id), false);
        drag.current = { mode: 'erase', x0: e.clientX, y0: e.clientY, orig: [], moved: false };
      } else {
        if (step >= len) return;
        setNotes((ns) => [...ns, { id: uid(), pitch, start: step, dur: snap || 0.25, vel: 0.85 }], false);
        audition(track.id, pitch);
        drag.current = { mode: 'paint', x0: e.clientX, y0: e.clientY, orig: [], moved: false };
      }
      return;
    }

    if (noteId) {
      const note = notes.find((n) => n.id === noteId)!;
      const rect = target!.getBoundingClientRect();
      const resize = e.clientX > rect.right - 7;
      let ids = s.selectedNotes;
      if (e.shiftKey) ids = sel.has(noteId) ? ids.filter((i) => i !== noteId) : [...ids, noteId];
      else if (!sel.has(noteId)) ids = [noteId];
      select(ids);
      const orig = notes.filter((n) => ids.includes(n.id));
      drag.current = { mode: resize ? 'resize' : 'move', x0: e.clientX, y0: e.clientY, orig, anchorId: noteId, moved: false, lastPitch: note.pitch };
      if (!resize) audition(track.id, note.pitch);
      return;
    }

    if (e.shiftKey) {
      drag.current = { mode: 'marquee', x0: x, y0: y, orig: [], moved: false };
      setMarquee({ x, y, w: 0, h: 0 });
      return;
    }

    // create a note and keep dragging it
    const start = snapB(beat);
    if (start >= len) return;
    const n: Note = { id: uid(), pitch: drums ? rows[row] : fitScale(rows[row]), start, dur: Math.min(noteLen, len - start), vel: 0.8 };
    s.checkpoint();
    setNotes((ns) => [...ns, n], false);
    select([n.id]);
    audition(track.id, n.pitch);
    drag.current = { mode: 'move', x0: e.clientX, y0: e.clientY, orig: [n], anchorId: n.id, moved: true, lastPitch: n.pitch };
  };

  const onGridMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'paint' || d.mode === 'erase') {
      const { beat, row } = posAt(e.clientX, e.clientY);
      const step = snapB(beat);
      const pitch = rows[row];
      if (step < 0 || step >= len) return;
      const cur = useStudio.getState().project.patterns.find((x) => x.id === pattern.id)?.notes[track.id] ?? [];
      const existing = cur.find((n) => n.pitch === pitch && Math.abs(n.start - step) < 1e-3);
      if (d.mode === 'paint' && !existing) setNotes((ns) => [...ns, { id: uid(), pitch, start: step, dur: snap || 0.25, vel: 0.85 }], false);
      if (d.mode === 'erase' && existing) setNotes((ns) => ns.filter((n) => n.id !== existing.id), false);
      return;
    }
    if (d.mode === 'marquee') {
      const { x, y } = posAt(e.clientX, e.clientY);
      setMarquee({ x: Math.min(x, d.x0), y: Math.min(y, d.y0), w: Math.abs(x - d.x0), h: Math.abs(y - d.y0) });
      return;
    }
    const dxPx = e.clientX - d.x0;
    const dyPx = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.abs(dxPx) < 3 && Math.abs(dyPx) < 3) return;
      d.moved = true;
      s.checkpoint();
    }
    const dBeat = dxPx / ppb;
    if (d.mode === 'resize') {
      const anchor = d.orig.find((n) => n.id === d.anchorId)!;
      const newDur = Math.max(snap || 0.0625, roundB(anchor.start + anchor.dur + dBeat) - anchor.start);
      const delta = newDur - anchor.dur;
      const map = new Map(d.orig.map((n) => [n.id, n]));
      setNotes((ns) => ns.map((n) => (map.has(n.id) ? { ...n, dur: Math.max(snap || 0.0625, map.get(n.id)!.dur + delta) } : n)), false);
      setNoteLen(newDur);
    } else {
      const anchor = d.orig.find((n) => n.id === d.anchorId)!;
      const newStart = roundB(anchor.start + dBeat);
      const shift = newStart - anchor.start;
      const dRows = Math.round(dyPx / ROW_H);
      const map = new Map(d.orig.map((n) => [n.id, n]));
      const rawAnchor = rows[Math.max(0, Math.min(rows.length - 1, rowOf(anchor.pitch) + dRows))];
      const newAnchorPitch = drums ? rawAnchor : fitScale(rawAnchor);
      if (newAnchorPitch !== d.lastPitch) {
        d.lastPitch = newAnchorPitch;
        audition(track.id, newAnchorPitch);
      }
      setNotes(
        (ns) =>
          ns.map((n) => {
            const o = map.get(n.id);
            if (!o) return n;
            const r = Math.max(0, Math.min(rows.length - 1, rowOf(o.pitch) + dRows));
            return { ...n, start: Math.max(0, Math.min(len - 0.0625, o.start + shift)), pitch: drums ? rows[r] : fitScale(rows[r]) };
          }),
        false,
      );
    }
  };

  const onGridUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === 'marquee' && marquee) {
      const b0 = marquee.x / ppb;
      const b1 = (marquee.x + marquee.w) / ppb;
      const r0 = Math.floor(marquee.y / ROW_H);
      const r1 = Math.floor((marquee.y + marquee.h) / ROW_H);
      select(
        notes
          .filter((n) => {
            const r = rowOf(n.pitch);
            return n.start < b1 && n.start + n.dur > b0 && r >= r0 && r <= r1;
          })
          .map((n) => n.id),
      );
      setMarquee(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const ids = s.selectedNotes;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'a') {
      select(notes.map((n) => n.id));
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) {
      setNotes((ns) => ns.filter((n) => !ids.includes(n.id)));
      select([]);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && ids.length && !drums) {
      const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1);
      setNotes((ns) => ns.map((n) => (ids.includes(n.id) ? { ...n, pitch: Math.max(21, Math.min(108, n.pitch + d)) } : n)));
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && ids.length) {
      const d = (e.key === 'ArrowRight' ? 1 : -1) * (snap || 0.25);
      setNotes((ns) => ns.map((n) => (ids.includes(n.id) ? { ...n, start: Math.max(0, n.start + d) } : n)));
    } else if (mod && e.key.toLowerCase() === 'd' && ids.length) {
      const chosen = notes.filter((n) => ids.includes(n.id));
      const span = Math.max(...chosen.map((n) => n.start + n.dur)) - Math.min(...chosen.map((n) => n.start));
      const copies = chosen.map((n) => ({ ...n, id: uid(), start: n.start + span })).filter((n) => n.start < len);
      setNotes((ns) => [...ns, ...copies]);
      select(copies.map((n) => n.id));
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const quantize = () => {
    const q = snap || 0.25;
    const ids = s.selectedNotes.length ? new Set(s.selectedNotes) : null;
    setNotes((ns) => ns.map((n) => (!ids || ids.has(n.id) ? { ...n, start: Math.round(n.start / q) * q } : n)));
  };

  /* velocity lane */
  const velDrag = useRef(false);
  const setVelAt = (clientX: number, clientY: number) => {
    const el = velRef.current!.querySelector('.vel-inner') as HTMLElement;
    const r = el.getBoundingClientRect();
    const beat = (clientX - r.left) / ppb;
    const v = Math.max(0.05, Math.min(1, 1 - (clientY - r.top) / VEL_H));
    const ids = new Set(s.selectedNotes);
    setNotes(
      (ns) =>
        ns.map((n) => {
          const hitN = beat >= n.start && beat <= n.start + Math.max(n.dur, 8 / ppb);
          if (!hitN) return n;
          if (ids.size && !ids.has(n.id)) return n;
          return { ...n, vel: Math.round(v * 100) / 100 };
        }),
      false,
    );
  };

  const beatsPerBar = s.project.beatsPerBar;

  return (
    <div className="pr">
      <div className="pr-toolbar">
        <span className="pr-swatch" style={{ background: pattern.color }} />
        <input
          className="input pr-name"
          value={pattern.name}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => s.edit((p) => mapPattern(p, pattern.id, (x) => ({ ...x, name: e.target.value })), false)}
          aria-label="Pattern name"
          data-hint="Pattern name — the piano roll edits this pattern"
        />
        <select
          className="select"
          value={track.id}
          onChange={(e) => s.setUi({ selectedTrackId: e.target.value, selectedNotes: [] })}
          aria-label="Channel"
          data-hint="Which channel's notes you are editing in this pattern"
          style={{ borderColor: track.color }}
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={len}
          onChange={(e) => s.edit((p) => mapPattern(p, pattern.id, (x) => ({ ...x, length: Number(e.target.value) })))}
          aria-label="Pattern length"
          data-hint="Pattern length in bars"
        >
          {[1, 2, 4, 8, 16].map((b) => (
            <option key={b} value={b * s.project.beatsPerBar}>
              {b} bar{b > 1 ? 's' : ''}
            </option>
          ))}
        </select>
        <Magnet size={14} className="faint" />
        <select className="select" value={snap} onChange={(e) => setSnap(Number(e.target.value))} aria-label="Grid">
          {SNAPS.map((o) => (
            <option key={o.label} value={o.v}>
              Grid {o.label}
            </option>
          ))}
        </select>
        {!drums && (
          <select className="select" value={noteLen} onChange={(e) => setNoteLen(Number(e.target.value))} aria-label="New note length">
            {[4, 2, 1, 0.5, 0.25, 0.125].map((v) => (
              <option key={v} value={v}>
                Length {v >= 1 ? `${v} beat${v > 1 ? 's' : ''}` : `1/${Math.round(4 / v)}`}
              </option>
            ))}
          </select>
        )}
        <button className="btn sm" onClick={quantize} title="Snap note starts to the grid (selection, or all)">
          <Wand2 /> Quantize
        </button>
        <button
          className="btn sm"
          onClick={() => {
            if (confirm(`Remove all ${track.name} notes from ${pattern.name}?`)) setNotes(() => []);
          }}
        >
          <Eraser /> Clear
        </button>
        {!drums && (
          <div className="pr-scale" data-hint="Highlight a key's notes so wrong notes stand out">
            <select className="select" value={prefs.root} onChange={(e) => prefs.set({ root: Number(e.target.value) })} aria-label="Key" disabled={prefs.scale === 'off'}>
              {NOTE_NAMES.map((nm, i) => (
                <option key={nm} value={i}>
                  {nm}
                </option>
              ))}
            </select>
            <select className="select" value={prefs.scale} onChange={(e) => prefs.set({ scale: e.target.value })} aria-label="Scale">
              <option value="off">No scale</option>
              {Object.entries(SCALES)
                .filter(([k]) => k !== 'chromatic')
                .map(([k, sc]) => (
                  <option key={k} value={k}>
                    {sc.label}
                  </option>
                ))}
            </select>
            <button
              className={`btn sm icon ${prefs.lock ? 'on' : ''}`}
              disabled={prefs.scale === 'off'}
              onClick={() => prefs.set({ lock: !prefs.lock })}
              data-hint="Scale lock: new and moved notes stay inside the scale"
              aria-label="Scale lock"
            >
              <Lock />
            </button>
          </div>
        )}
        {!drums && (
          <button
            className={`btn sm icon ${prefs.ghosts ? 'on' : ''}`}
            onClick={() => prefs.set({ ghosts: !prefs.ghosts })}
            data-hint="Ghost notes: see the other channels of this pattern faintly behind yours"
            aria-label="Ghost notes"
          >
            <Ghost />
          </button>
        )}
        <div className="spacer" />
        <span className="faint pr-help">
          {drums ? 'Click or drag to paint steps · click a step to erase' : 'Click to draw · drag to move · edge to resize · Shift-drag to select · Del to delete'}
        </span>
        <ZoomIn size={14} className="faint" />
        <div style={{ width: 110 }}>
          <Range value={ppb} min={24} max={260} step={2} onChange={setPpb} ariaLabel="Editor zoom" />
        </div>
      </div>

      <div
        className="pr-main"
        ref={mainRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (velRef.current) velRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <div className="pr-inner" style={{ width: KEYW + W, height: H }}>
          <div className="pr-keys" style={{ width: KEYW, height: H }}>
            {rows.map((m) => (
              <div
                key={m}
                className={`pr-key ${drums ? 'drum' : isBlack(m) ? 'black' : 'white'} ${pitchClass(m) === 0 ? 'c' : ''} ${scaleOn && inScale(m, prefs.root, prefs.scale) ? 'in-scale' : ''} ${scaleOn && pitchClass(m - prefs.root) === 0 ? 'root' : ''}`}
                style={{ height: ROW_H }}
                onPointerDown={() => audition(track.id, m)}
              >
                {drums ? DRUM_PIECES.find((p) => p.midi === m)?.label : pitchClass(m) === 0 ? noteName(m) : ''}
              </div>
            ))}
          </div>
          <div
            ref={gridRef}
            className={`pr-grid ${drums ? 'drum' : ''}`}
            style={{
              left: KEYW,
              width: W,
              height: H,
              ['--ppb' as string]: `${ppb}px`,
              ['--snap' as string]: `${(snap || 0.25) * ppb}px`,
              ['--barw' as string]: `${beatsPerBar * ppb}px`,
              ['--row' as string]: `${ROW_H}px`,
            }}
            onPointerDown={onGridDown}
            onPointerMove={onGridMove}
            onPointerUp={onGridUp}
            onContextMenu={(e) => {
              e.preventDefault();
              const id = (e.target as HTMLElement).closest<HTMLElement>('[data-note]')?.dataset.note;
              if (id) setNotes((ns) => ns.filter((n) => n.id !== id));
            }}
          >
            {!drums &&
              rows.map((m, i) =>
                scaleOn ? (
                  !inScale(m, prefs.root, prefs.scale) ? (
                    <div key={m} className="pr-rowbg off-scale" style={{ top: i * ROW_H, height: ROW_H }} />
                  ) : pitchClass(m - prefs.root) === 0 ? (
                    <div key={m} className="pr-rowbg root" style={{ top: i * ROW_H, height: ROW_H }} />
                  ) : null
                ) : isBlack(m) ? (
                  <div key={m} className="pr-rowbg" style={{ top: i * ROW_H, height: ROW_H }} />
                ) : null,
              )}
            {ghosts.map((n) => {
              const r = rowOf(n.pitch);
              if (r < 0 || n.start >= len) return null;
              return (
                <div
                  key={`g${n.id}`}
                  className="pr-ghost"
                  style={{ left: n.start * ppb, top: r * ROW_H + 2, width: Math.max(4, n.dur * ppb - 1), height: ROW_H - 4, ['--clip' as string]: n.color }}
                />
              );
            })}
            {notes.map((n) => {
              const r = rowOf(n.pitch);
              if (r < 0) return null;
              return (
                <div
                  key={n.id}
                  data-note={n.id}
                  className={`pr-note ${sel.has(n.id) ? 'sel' : ''}`}
                  style={{
                    left: n.start * ppb,
                    top: r * ROW_H + 1,
                    width: Math.max(5, n.dur * ppb - 1),
                    height: ROW_H - 2,
                    ['--clip' as string]: track.color,
                    ['--vel' as string]: String(0.45 + n.vel * 0.55),
                  }}
                  onDoubleClick={() => setNotes((ns) => ns.filter((x) => x.id !== n.id))}
                >
                  {!drums && ROW_H >= 12 && n.dur * ppb > 34 && <span>{noteName(n.pitch)}</span>}
                </div>
              );
            })}
            {marquee && <div className="pr-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
            <div className="pr-playhead" ref={playRef} />
          </div>
        </div>
      </div>

      <div className="pr-vel" ref={velRef}>
        <div
          className="vel-inner"
          style={{ width: W, height: VEL_H, marginLeft: KEYW }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            velDrag.current = true;
            s.checkpoint();
            setVelAt(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => velDrag.current && setVelAt(e.clientX, e.clientY)}
          onPointerUp={() => (velDrag.current = false)}
        >
          {notes.map((n) => (
            <i
              key={n.id}
              className={sel.has(n.id) ? 'sel' : ''}
              style={{ left: n.start * ppb, height: `${n.vel * 100}%`, ['--clip' as string]: track.color }}
            />
          ))}
        </div>
        <span className="vel-label">Velocity</span>
      </div>
    </div>
  );
}
