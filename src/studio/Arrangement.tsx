import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Copy, Drum, Mic, Piano, Plus, Scissors, Trash2, Upload } from 'lucide-react';
import { useStudio, mapTrack, mapClip, makeTrack, cloneClip, splitClip, uid, songEnd } from './store';
import { currentBeat, importAudioFile, seek } from './playback';
import { getBuffer, peaks, useBuffers } from './buffers';
import type { AudioClip, Clip, MidiClip, Track } from './types';
import { TRACK_COLORS } from './types';
import { groupedInstruments, isKitId, displayName } from '../lib/instruments';
import { Range } from '../components/ui';

const HEAD = 236;
const ROW = 68;
const RULER = 34;

const snapTo = (b: number, snap: number) => (snap > 0 ? Math.round(b / snap) * snap : b);

export function InstrumentSelect({ value, onChange, kitsOnly }: { value: string; onChange: (id: string) => void; kitsOnly?: boolean }) {
  const groups = useMemo(() => groupedInstruments(), []);
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Instrument">
      {groups
        .filter((g) => (kitsOnly === undefined ? true : kitsOnly ? g.family === 'drums' : g.family !== 'drums'))
        .map((g) => (
          <optgroup key={g.family} label={g.label}>
            {g.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  );
}

function MidiPreview({ clip, color }: { clip: MidiClip; color: string }) {
  if (!clip.notes.length) return null;
  const pitches = clip.notes.map((n) => n.pitch);
  const lo = Math.min(...pitches) - 1;
  const hi = Math.max(...pitches) + 1;
  const span = Math.max(8, hi - lo);
  return (
    <svg className="clip-notes" viewBox={`0 0 ${clip.length * 100} 100`} preserveAspectRatio="none">
      {clip.notes.map((n) =>
        n.start < clip.length ? (
          <rect
            key={n.id}
            x={n.start * 100}
            y={((hi - n.pitch) / span) * 100 - 100 / span / 2}
            width={Math.max(6, Math.min(n.dur, clip.length - n.start) * 100 - 4)}
            height={Math.max(3, 100 / span - 1)}
            fill={color}
          />
        ) : null,
      )}
    </svg>
  );
}

function Waveform({ clip, bpm, width, color }: { clip: AudioClip; bpm: number; width: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ready = useBuffers((s) => s.ready[clip.bufferId]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const pk = peaks(clip.bufferId);
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(width));
    const h = ROW - 22;
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (!pk) return;
    ctx.fillStyle = color;
    const total = pk.length;
    // peaks span the whole buffer; map the clip window onto them
    const clipSec = (clip.length * 60) / bpm;
    for (let x = 0; x < w; x++) {
      const sec = clip.offset + (x / w) * clipSec;
      const idx = Math.floor((sec / bufferDuration(clip.bufferId)) * total);
      const v = pk[Math.min(total - 1, Math.max(0, idx))] ?? 0;
      const bh = Math.max(1, v * h * 0.95);
      ctx.fillRect(x, (h - bh) / 2, 1, bh);
    }
  }, [clip, bpm, width, color, ready]);
  return <canvas ref={ref} className="clip-wave" />;
}

const bufferDuration = (id: string) => getBuffer(id)?.duration ?? 1;

type DragMode = 'move' | 'left' | 'right';

export function Arrangement() {
  const s = useStudio();
  const p = s.project;
  const ppb = s.pxPerBeat;
  const end = songEnd(p);
  const totalBeats = Math.max(p.bars * p.beatsPerBar, Math.ceil((end + 8) / p.beatsPerBar) * p.beatsPerBar);
  const W = totalBeats * ppb;
  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importTarget = useRef<{ trackId: string; beat: number } | null>(null);

  // playhead follows transport without re-rendering React
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const st = useStudio.getState();
      const b = st.playing ? currentBeat() : st.cursor;
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${HEAD + b * st.pxPerBeat}px)`;
      // keep the playhead visible while playing
      const sc = scrollRef.current;
      if (st.playing && sc) {
        const x = b * st.pxPerBeat;
        if (x > sc.scrollLeft + sc.clientWidth - HEAD - 40 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 80);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* --------------------------------------------------------- clip drag */
  const drag = useRef<{
    mode: DragMode;
    clipId: string;
    trackId: string;
    x0: number;
    orig: Clip;
    moved: boolean;
    copy: boolean;
  } | null>(null);

  const onClipDown = (e: React.PointerEvent, t: Track, c: Clip) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rel = e.clientX - rect.left;
    const mode: DragMode = rel < 7 ? 'left' : rel > rect.width - 7 ? 'right' : 'move';
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, clipId: c.id, trackId: t.id, x0: e.clientX, orig: c, moved: false, copy: e.altKey || e.ctrlKey };
    s.setUi({ selectedClipId: c.id, selectedTrackId: t.id, selectedNotes: [] });
  };

  const onClipMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x0) / ppb;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3) return;
    if (!d.moved) {
      d.moved = true;
      s.checkpoint();
      if (d.copy && d.mode === 'move') {
        // leave a copy behind at the original position
        const copy = cloneClip(d.orig, d.orig.start);
        s.edit((pr) => mapTrack(pr, d.trackId, (t) => ({ ...t, clips: [...t.clips, copy] })), false);
      }
    }
    const o = d.orig;
    const sn = s.snap;
    if (d.mode === 'move') {
      const start = Math.max(0, snapTo(o.start + dx, sn));
      // vertical move to a compatible track
      const laneEl = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-track]');
      const targetId = laneEl?.dataset.track;
      const target = p.tracks.find((t) => t.id === targetId);
      const compatible = target && (o.kind === 'audio' ? target.kind === 'audio' : target.kind !== 'audio');
      s.edit((pr) => {
        let next = pr;
        if (compatible && target && target.id !== d.trackId) {
          const clip = pr.tracks.find((t) => t.id === d.trackId)?.clips.find((c) => c.id === d.clipId);
          if (clip) {
            next = mapTrack(next, d.trackId, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== d.clipId) }));
            next = mapTrack(next, target.id, (t) => ({ ...t, clips: [...t.clips, clip] }));
            d.trackId = target.id;
          }
        }
        return mapClip(next, d.clipId, (c) => ({ ...c, start }));
      }, false);
    } else if (d.mode === 'right') {
      const length = Math.max(sn || 0.25, snapTo(o.start + o.length + dx, sn) - o.start);
      s.edit((pr) => mapClip(pr, d.clipId, (c) => ({ ...c, length })), false);
    } else {
      const newStart = Math.max(0, Math.min(o.start + o.length - (sn || 0.25), snapTo(o.start + dx, sn)));
      const delta = newStart - o.start;
      s.edit(
        (pr) =>
          mapClip(pr, d.clipId, (c) => {
            if (c.kind === 'midi' && o.kind === 'midi')
              return {
                ...c,
                start: newStart,
                length: o.length - delta,
                notes: o.notes.map((n) => ({ ...n, start: n.start - delta })).filter((n) => n.start + n.dur > 0),
              };
            if (c.kind === 'audio' && o.kind === 'audio')
              return { ...c, start: newStart, length: o.length - delta, offset: Math.max(0, o.offset + (delta * 60) / pr.bpm) };
            return c;
          }),
        false,
      );
    }
  };
  const onClipUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      s.setUi({ dock: 'editor', dockOpen: true });
    }
  };

  /* ------------------------------------------------------------- ruler */
  const rulerDrag = useRef<{ loop: boolean; b0: number } | null>(null);
  const beatAt = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left) / ppb);
  };

  const addClipAt = (t: Track, beat: number) => {
    const bar = p.beatsPerBar;
    const start = Math.floor(beat / bar) * bar;
    const clip: MidiClip = { id: uid(), kind: 'midi', name: t.kind === 'drums' ? 'Beat' : 'Clip', start, length: bar, notes: [] };
    s.edit((pr) => mapTrack(pr, t.id, (tr) => ({ ...tr, clips: [...tr.clips, clip] })));
    s.setUi({ selectedClipId: clip.id, selectedTrackId: t.id, dock: 'editor', dockOpen: true });
  };

  const addTrack = (kind: 'instrument' | 'drums' | 'audio') => {
    setAddOpen(false);
    const inst = kind === 'drums' ? 'kit:standard-kit' : kind === 'audio' ? '' : 'studio-acoustic-grand-piano';
    const t = makeTrack(kind, inst, p.tracks.length);
    s.edit((pr) => ({ ...pr, tracks: [...pr.tracks, t] }));
    s.setUi({ selectedTrackId: t.id });
  };

  const ctxClip = ctx ? p.tracks.flatMap((t) => t.clips.map((c) => ({ t, c }))).find((x) => x.c.id === ctx.clipId) : null;

  return (
    <div className="arr" ref={scrollRef} onPointerDown={() => ctx && setCtx(null)}>
      <div className="arr-inner" style={{ width: HEAD + W, ['--ppb' as string]: `${ppb}px`, ['--bar' as string]: `${ppb * p.beatsPerBar}px` }}>
        <div className="arr-top" style={{ height: RULER }}>
          <div className="arr-corner" style={{ width: HEAD }}>
            <div className="menu-wrap">
              <button className="btn sm" onClick={() => setAddOpen((o) => !o)}>
                <Plus /> Track
              </button>
              {addOpen && (
                <div className="menu" onMouseLeave={() => setAddOpen(false)}>
                  <button onClick={() => addTrack('instrument')}>
                    <Piano /> Instrument track
                  </button>
                  <button onClick={() => addTrack('drums')}>
                    <Drum /> Drum track
                  </button>
                  <button onClick={() => addTrack('audio')}>
                    <Mic /> Audio / vocal track
                  </button>
                </div>
              )}
            </div>
            <span className="faint arr-count">{p.tracks.length} tracks</span>
          </div>
          <div
            className="ruler"
            style={{ width: W }}
            onPointerDown={(e) => {
              const el = e.currentTarget;
              (el as HTMLElement).setPointerCapture(e.pointerId);
              const r = el.getBoundingClientRect();
              const loopBand = e.clientY - r.top < RULER * 0.42;
              const b = beatAt(e.clientX, el);
              if (loopBand) {
                const st = Math.floor(b / p.beatsPerBar) * p.beatsPerBar;
                rulerDrag.current = { loop: true, b0: st };
                s.checkpoint();
                s.edit((pr) => ({ ...pr, loop: { on: true, start: st, end: st + pr.beatsPerBar } }), false);
              } else {
                rulerDrag.current = { loop: false, b0: b };
                seek(snapTo(b, s.snap || 0.25));
              }
            }}
            onPointerMove={(e) => {
              const d = rulerDrag.current;
              if (!d) return;
              const b = beatAt(e.clientX, e.currentTarget);
              if (d.loop) {
                const bar = p.beatsPerBar;
                const a = d.b0;
                const z = Math.ceil(b / bar) * bar;
                const start = Math.min(a, z - bar);
                const endB = Math.max(a + bar, z);
                s.edit((pr) => ({ ...pr, loop: { on: true, start: Math.max(0, start), end: endB } }), false);
              } else seek(snapTo(b, s.snap || 0.25));
            }}
            onPointerUp={() => (rulerDrag.current = null)}
          >
            <div className="ruler-loopband" />
            {p.loop.on || p.loop.end > p.loop.start ? (
              <div
                className={`ruler-loop ${p.loop.on ? 'on' : ''}`}
                style={{ left: p.loop.start * ppb, width: (p.loop.end - p.loop.start) * ppb }}
              />
            ) : null}
            {Array.from({ length: Math.ceil(totalBeats / p.beatsPerBar) }).map((_, bar) => (
              <div key={bar} className="ruler-bar" style={{ left: bar * p.beatsPerBar * ppb, width: p.beatsPerBar * ppb }}>
                {(ppb >= 14 || bar % 2 === 0) && <span className="mono">{bar + 1}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="arr-rows">
          {p.tracks.map((t) => (
            <div key={t.id} className={`arr-row ${s.selectedTrackId === t.id ? 'sel' : ''}`} style={{ height: ROW }}>
              <TrackHeader track={t} selected={s.selectedTrackId === t.id} />
              <div
                className={`lane ${t.kind}`}
                data-track={t.id}
                style={{ width: W }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  s.setUi({ selectedTrackId: t.id, selectedClipId: null });
                  seek(snapTo(beatAt(e.clientX, e.currentTarget), s.snap || 0.25));
                }}
                onDoubleClick={(e) => {
                  const b = beatAt(e.clientX, e.currentTarget);
                  if (t.kind === 'audio') {
                    importTarget.current = { trackId: t.id, beat: snapTo(b, s.snap) };
                    fileRef.current?.click();
                  } else addClipAt(t, b);
                }}
                onDragOver={(e) => t.kind === 'audio' && e.preventDefault()}
                onDrop={(e) => {
                  if (t.kind !== 'audio') return;
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void importAudioFile(f, t.id, snapTo(beatAt(e.clientX, e.currentTarget), s.snap));
                }}
              >
                {t.clips.map((c) => (
                  <div
                    key={c.id}
                    className={`clip ${c.kind} ${s.selectedClipId === c.id ? 'sel' : ''}`}
                    style={{ left: c.start * ppb, width: Math.max(4, c.length * ppb), ['--clip' as string]: t.color }}
                    onPointerDown={(e) => onClipDown(e, t, c)}
                    onPointerMove={onClipMove}
                    onPointerUp={onClipUp}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      s.setUi({ selectedClipId: c.id, dock: 'editor', dockOpen: true });
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      s.setUi({ selectedClipId: c.id, selectedTrackId: t.id });
                      setCtx({ x: e.clientX, y: e.clientY, clipId: c.id });
                    }}
                  >
                    <div className="clip-head">
                      <span>{c.name}</span>
                    </div>
                    <div className="clip-body">
                      {c.kind === 'midi' ? (
                        <MidiPreview clip={c} color={t.color} />
                      ) : (
                        <Waveform clip={c} bpm={p.bpm} width={c.length * ppb} color={t.color} />
                      )}
                    </div>
                  </div>
                ))}
                {t.kind === 'audio' && !t.clips.length && (
                  <div className="lane-hint">
                    <Mic size={13} /> Arm <b>R</b> and press record, or drop / double-click to import audio
                  </div>
                )}
                {t.kind !== 'audio' && !t.clips.length && <div className="lane-hint">Double-click to add a clip, or arm and record</div>}
              </div>
            </div>
          ))}
          <div className="arr-row arr-add" style={{ height: 44 }}>
            <div className="arr-add-head" style={{ width: HEAD }}>
              <button className="btn ghost sm" onClick={() => addTrack('instrument')}>
                <Piano /> Instrument
              </button>
              <button className="btn ghost sm" onClick={() => addTrack('drums')}>
                <Drum /> Drums
              </button>
              <button className="btn ghost sm" onClick={() => addTrack('audio')}>
                <AudioLines /> Audio
              </button>
            </div>
          </div>
        </div>
        <div className="playhead" ref={playheadRef} />
      </div>

      {ctx && ctxClip && (
        <div className="menu ctx" style={{ left: ctx.x, top: ctx.y }} onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              const c = cloneClip(ctxClip.c, ctxClip.c.start + ctxClip.c.length);
              s.edit((pr) => mapTrack(pr, ctxClip.t.id, (t) => ({ ...t, clips: [...t.clips, c] })));
              s.setUi({ selectedClipId: c.id });
              setCtx(null);
            }}
          >
            <Copy /> Duplicate <kbd>Ctrl D</kbd>
          </button>
          <button
            onClick={() => {
              const parts = splitClip(ctxClip.c, s.cursor, p.bpm);
              if (parts)
                s.edit((pr) => mapTrack(pr, ctxClip.t.id, (t) => ({ ...t, clips: t.clips.flatMap((c) => (c.id === ctxClip.c.id ? parts : [c])) })));
              setCtx(null);
            }}
          >
            <Scissors /> Split at cursor <kbd>Ctrl E</kbd>
          </button>
          <button
            onClick={() => {
              const name = prompt('Clip name', ctxClip.c.name);
              if (name) s.edit((pr) => mapClip(pr, ctxClip.c.id, (c) => ({ ...c, name })));
              setCtx(null);
            }}
          >
            Rename…
          </button>
          <button
            className="danger"
            onClick={() => {
              s.edit((pr) => mapTrack(pr, ctxClip.t.id, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== ctxClip.c.id) })));
              s.setUi({ selectedClipId: null });
              setCtx(null);
            }}
          >
            <Trash2 /> Delete <kbd>Del</kbd>
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          const tgt = importTarget.current;
          if (f && tgt) void importAudioFile(f, tgt.trackId, tgt.beat);
        }}
      />
    </div>
  );
}

function TrackHeader({ track: t, selected }: { track: Track; selected: boolean }) {
  const s = useStudio();
  const up = (patch: Partial<Track>, record = true) => s.edit((pr) => mapTrack(pr, t.id, (tr) => ({ ...tr, ...patch })), record);
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const Icon = t.kind === 'audio' ? Mic : t.kind === 'drums' ? Drum : Piano;

  return (
    <div
      className={`track-head ${selected ? 'sel' : ''}`}
      style={{ width: HEAD, ['--clip' as string]: t.color }}
      onPointerDown={() => s.setUi({ selectedTrackId: t.id })}
    >
      <button
        className="th-color"
        title="Change colour"
        onClick={() => up({ color: TRACK_COLORS[(TRACK_COLORS.indexOf(t.color) + 1) % TRACK_COLORS.length] })}
      />
      <div className="th-main">
        <div className="th-top">
          <Icon size={13} className="faint" />
          <input
            className="th-name"
            value={t.name}
            onChange={(e) => up({ name: e.target.value }, false)}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="Track name"
          />
          <div className="menu-wrap">
            <button className="btn ghost sm icon" onClick={() => setMenu((m) => !m)} aria-label="Track options">
              ⋯
            </button>
            {menu && (
              <div className="menu right" onMouseLeave={() => setMenu(false)}>
                <button
                  onClick={() => {
                    setMenu(false);
                    const copy: Track = {
                      ...t,
                      id: uid(),
                      name: `${t.name} copy`,
                      arm: false,
                      clips: t.clips.map((c) => cloneClip(c, c.start)),
                    };
                    s.edit((pr) => {
                      const i = pr.tracks.findIndex((x) => x.id === t.id);
                      const tracks = [...pr.tracks];
                      tracks.splice(i + 1, 0, copy);
                      return { ...pr, tracks };
                    });
                  }}
                >
                  <Copy /> Duplicate track
                </button>
                {t.kind === 'audio' && (
                  <button
                    onClick={() => {
                      setMenu(false);
                      fileRef.current?.click();
                    }}
                  >
                    <Upload /> Import audio at cursor
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenu(false);
                    s.edit((pr) => {
                      const i = pr.tracks.findIndex((x) => x.id === t.id);
                      if (i <= 0) return pr;
                      const tracks = [...pr.tracks];
                      [tracks[i - 1], tracks[i]] = [tracks[i], tracks[i - 1]];
                      return { ...pr, tracks };
                    });
                  }}
                >
                  Move up
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    setMenu(false);
                    s.edit((pr) => ({ ...pr, tracks: pr.tracks.filter((x) => x.id !== t.id) }));
                  }}
                >
                  <Trash2 /> Delete track
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="th-bottom">
          {t.kind !== 'audio' ? (
            <InstrumentSelect
              value={t.instrumentId}
              onChange={(id) => up({ instrumentId: id, kind: isKitId(id) ? 'drums' : 'instrument', name: t.name === displayName(t.instrumentId) ? displayName(id) : t.name })}
            />
          ) : (
            <span className="th-audio faint">Mic / audio input</span>
          )}
          <button className={`btn sm icon ${t.mute ? 'on' : ''}`} title="Mute" onClick={() => up({ mute: !t.mute })}>
            M
          </button>
          <button className={`btn sm icon solo ${t.solo ? 'on' : ''}`} title="Solo" onClick={() => up({ solo: !t.solo })}>
            S
          </button>
          <button className={`btn sm icon rec ${t.arm ? 'on' : ''}`} title="Arm for recording" onClick={() => up({ arm: !t.arm })}>
            R
          </button>
        </div>
        <Range value={t.volume} min={-40} max={6} step={0.5} onChange={(v) => up({ volume: v }, false)} className="th-vol" ariaLabel="Volume" />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importAudioFile(f, t.id, useStudio.getState().cursor);
        }}
      />
    </div>
  );
}
