import { useEffect, useRef, useState } from 'react';
import { Copy, Grid3x3, MousePointer2, Music2, Pencil, Plus, Sparkles, Split, Trash2 } from 'lucide-react';
import {
  useStudio,
  mapItem,
  cloneItem,
  songEnd,
  currentPattern,
  ensureLanes,
  uid,
  applyPreset,
  addChannel,
  channelKind,
  clonePattern,
} from './store';
import { currentBeat, importAudioFile, seek } from './playback';
import type { PlaylistItem, Project } from './types';
import { PatternPreview, Waveform, DRAG_MIME, readDrag } from './common';
import { presetById } from './presets';
import { useMobile, useMobileStore } from '../lib/useMobile';
import { createLongPress, menuPosition } from '../lib/longPress';

const HEAD_DESKTOP = 148;
const HEAD_MOBILE = 72;
const headWidth = () => (useMobileStore.getState().mode ? HEAD_MOBILE : HEAD_DESKTOP);
const ROW = 54;
const RULER = 34;

const snapTo = (b: number, snap: number) => (snap > 0 ? Math.round(b / snap) * snap : b);
const snapDown = (b: number, snap: number) => (snap > 0 ? Math.floor(b / snap + 1e-6) * snap : b);

type DragMode = 'move' | 'left' | 'right';

export function Playlist() {
  const s = useStudio();
  const mobile = useMobile();
  const HEAD = mobile ? HEAD_MOBILE : HEAD_DESKTOP;
  const p = s.project;
  const ppb = s.pxPerBeat;
  const end = songEnd(p);
  const totalBeats = Math.max(p.bars * p.beatsPerBar, Math.ceil((end + 16) / p.beatsPerBar) * p.beatsPerBar);
  const W = totalBeats * ppb;
  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importAt = useRef<{ start: number; lane: number } | null>(null);
  const [tool, setTool] = useState<'draw' | 'select'>('draw');
  const [renaming, setRenaming] = useState<number | null>(null);
  const [clipMenu, setClipMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const press = useRef(createLongPress()).current;
  const lanePress = useRef(createLongPress()).current;
  const cur = currentPattern(p);
  const patternsById = new Map(p.patterns.map((x) => [x.id, x]));

  // playhead follows transport without re-rendering React
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const st = useStudio.getState();
      const song = st.project.mode === 'song';
      const b = st.playing && song ? currentBeat() : st.cursor;
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${headWidth() + b * st.pxPerBeat}px)`;
        playheadRef.current.style.opacity = song || !st.playing ? '1' : '0.25';
      }
      const sc = scrollRef.current;
      if (st.playing && song && sc) {
        const x = b * st.pxPerBeat;
        if (x > sc.scrollLeft + sc.clientWidth - headWidth() - 40 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 80);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ------------------------------------------------------------ items */
  const drag = useRef<{ mode: DragMode; id: string; x0: number; orig: PlaylistItem; moved: boolean; copy: boolean } | null>(null);

  const laneAt = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-lane]');
    return el ? Number(el.dataset.lane) : null;
  };
  const beatAt = (clientX: number, el: Element) => Math.max(0, (clientX - el.getBoundingClientRect().left) / ppb);

  const onItemDown = (e: React.PointerEvent, it: PlaylistItem) => {
    press.track(e);
    if (e.button !== 0) return;
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rel = e.clientX - rect.left;
    const edge = mobile ? 12 : 7;
    const mode: DragMode = rel < edge ? 'left' : rel > rect.width - edge ? 'right' : 'move';
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    drag.current = { mode, id: it.id, x0: e.clientX, orig: it, moved: false, copy: e.altKey || e.ctrlKey };
    s.setUi({ selectedItemId: it.id, selectedNotes: [] });
    press.down(e, (x, y) => {
      drag.current = null;
      setClipMenu({ x, y, id: it.id });
    });
    if (it.kind === 'pattern') s.edit((pr) => ({ ...pr, currentPatternId: it.patternId }), false);
    else s.setUi({ selectedTrackId: it.channelId });
  };

  const onItemMove = (e: React.PointerEvent) => {
    press.move(e);
    const d = drag.current;
    if (!d || press.fired) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3 && d.mode !== 'move') return;
    const dx = (e.clientX - d.x0) / ppb;
    const lane = laneAt(e.clientX, e.clientY);
    if (!d.moved) {
      if (Math.abs(e.clientX - d.x0) < 3 && (lane === null || lane === d.orig.lane)) return;
      d.moved = true;
      s.checkpoint();
      if (d.copy && d.mode === 'move') {
        const copy = cloneItem(d.orig, d.orig.start);
        s.edit((pr) => ({ ...pr, playlist: [...pr.playlist, copy] }), false);
      }
    }
    const o = d.orig;
    const sn = s.snap;
    if (d.mode === 'move') {
      const start = Math.max(0, snapTo(o.start + dx, sn));
      s.edit((pr) => ensureLanes(mapItem(pr, d.id, (it) => ({ ...it, start, lane: lane ?? it.lane })), lane ?? 0), false);
    } else if (d.mode === 'right') {
      const length = Math.max(sn || 0.25, snapTo(o.start + o.length + dx, sn) - o.start);
      s.edit((pr) => mapItem(pr, d.id, (it) => ({ ...it, length })), false);
    } else {
      const newStart = Math.max(0, Math.min(o.start + o.length - (sn || 0.25), snapTo(o.start + dx, sn)));
      const delta = newStart - o.start;
      s.edit(
        (pr) =>
          mapItem(pr, d.id, (it) =>
            it.kind === 'audio' && o.kind === 'audio'
              ? { ...it, start: newStart, length: o.length - delta, offset: Math.max(0, o.offset + (delta * 60) / pr.bpm) }
              : { ...it, start: newStart, length: o.length - delta },
          ),
        false,
      );
    }
  };
  const onItemUp = () => {
    press.up();
    drag.current = null;
  };

  const removeItem = (id: string) => {
    s.edit((pr) => ({ ...pr, playlist: pr.playlist.filter((x) => x.id !== id) }));
    if (s.selectedItemId === id) s.setUi({ selectedItemId: null });
  };

  /* ----------------------------------------------------------- lanes */
  const placePattern = (lane: number, beat: number) => {
    const start = snapDown(beat, s.snap || p.beatsPerBar);
    const item: PlaylistItem = { id: uid(), kind: 'pattern', patternId: cur.id, lane, start, length: cur.length };
    s.edit((pr) => ensureLanes({ ...pr, playlist: [...pr.playlist, item], mode: 'song' }, lane));
    s.setUi({ selectedItemId: item.id });
  };

  const onLaneDown = (e: React.PointerEvent, lane: number) => {
    if (e.button !== 0) return;
    const beat = beatAt(e.clientX, e.currentTarget);
    if (tool === 'draw') placePattern(lane, beat);
    else {
      s.setUi({ selectedItemId: null });
      seek(snapTo(beat, s.snap || 0.25));
    }
  };

  const onDrop = (e: React.DragEvent, lane: number) => {
    e.preventDefault();
    const start = snapDown(beatAt(e.clientX, e.currentTarget), s.snap || p.beatsPerBar);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      void importAudioFile(f, { start, lane });
      return;
    }
    const payload = readDrag(e);
    if (payload?.type === 'preset') {
      const pre = presetById(payload.id);
      if (!pre) return;
      let res: ReturnType<typeof applyPreset> | null = null;
      s.edit((pr) => {
        res = applyPreset(pr, pre, { channelId: s.selectedTrackId, place: { lane, start } });
        return { ...res.project, mode: 'song' };
      });
      const r = res as ReturnType<typeof applyPreset> | null;
      if (r) s.setUi({ selectedTrackId: r.channel.id, selectedItemId: r.item?.id ?? null });
    } else if (payload?.type === 'instrument') {
      let id = '';
      s.edit((pr) => {
        const [next, ch] = addChannel(pr, channelKind(payload.id), payload.id);
        id = ch.id;
        return next;
      });
      s.setUi({ selectedTrackId: id, dock: 'rack', dockOpen: true });
    }
  };

  /* ------------------------------------------------------------ ruler */
  const rulerDrag = useRef<{ loop: boolean; b0: number } | null>(null);

  const laneName = (i: number) => p.lanes[i]?.name ?? `Track ${i + 1}`;
  const setLane = (i: number, patch: Partial<Project['lanes'][number]>) =>
    s.edit((pr) => ({ ...pr, lanes: pr.lanes.map((l, k) => (k === i ? { ...l, ...patch } : l)) }));

  const empty = p.playlist.length === 0;

  return (
    <div className="pl">
      <div className="pl-bar">
        <span className="pl-title">Playlist</span>
        <span className="faint pl-sub">Arrangement</span>
        <div className="seg pl-tools">
          <button className={tool === 'draw' ? 'on' : ''} onClick={() => setTool('draw')} data-hint="Draw: click an empty spot to place the current pattern">
            <Pencil /> Draw
          </button>
          <button className={tool === 'select' ? 'on' : ''} onClick={() => setTool('select')} data-hint="Select: click to move the play cursor, drag clips">
            <MousePointer2 /> Select
          </button>
        </div>
        <span className="pl-brush" data-hint="The pattern that Draw places — change it in the toolbar or by clicking a clip">
          <i style={{ background: cur.color }} />
          {cur.name}
        </span>
        <div className="spacer" />
        {!mobile && <span className="faint pl-help">Right-click a clip to delete · Alt-drag to copy · drag edges to resize</span>}
      </div>

      <div className="pl-scroll" ref={scrollRef}>
        <div className="pl-inner" style={{ width: HEAD + W, ['--ppb' as string]: `${ppb}px`, ['--bar' as string]: `${ppb * p.beatsPerBar}px` }}>
          <div className="pl-top" style={{ height: RULER }}>
            <div className="pl-corner" style={{ width: HEAD }}>
              <button
                className="btn sm ghost"
                onClick={() => s.edit((pr) => ensureLanes(pr, pr.lanes.length))}
                data-hint="Add more playlist tracks"
              >
                <Plus /> {!mobile && 'Tracks'}
              </button>
            </div>
            <div
              className="ruler"
              style={{ width: W }}
              data-hint="Click to move the play cursor · drag the top strip to set a loop"
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
                  if (p.mode === 'pattern') s.edit((pr) => ({ ...pr, mode: 'song' }), false);
                  seek(snapTo(b, s.snap || 0.25));
                }
              }}
              onPointerMove={(e) => {
                const d = rulerDrag.current;
                if (!d) return;
                const b = beatAt(e.clientX, e.currentTarget);
                if (d.loop) {
                  const bar = p.beatsPerBar;
                  const z = Math.ceil(b / bar) * bar;
                  s.edit((pr) => ({ ...pr, loop: { on: true, start: Math.max(0, Math.min(d.b0, z - bar)), end: Math.max(d.b0 + bar, z) } }), false);
                } else seek(snapTo(b, s.snap || 0.25));
              }}
              onPointerUp={() => (rulerDrag.current = null)}
            >
              <div className="ruler-loopband" />
              {p.loop.end > p.loop.start && (
                <div className={`ruler-loop ${p.loop.on ? 'on' : ''}`} style={{ left: p.loop.start * ppb, width: (p.loop.end - p.loop.start) * ppb }} />
              )}
              {Array.from({ length: Math.ceil(totalBeats / p.beatsPerBar) }).map((_, bar) => (
                <div key={bar} className="ruler-bar" style={{ left: bar * p.beatsPerBar * ppb, width: p.beatsPerBar * ppb }}>
                  {(ppb >= 14 || bar % 2 === 0) && <span className="mono">{bar + 1}</span>}
                </div>
              ))}
            </div>
          </div>

          {p.lanes.map((lane, i) => (
            <div key={i} className="pl-row" style={{ height: ROW }}>
              <div className={`pl-head ${lane.mute ? 'muted' : ''}`} style={{ width: HEAD }}>
                <button
                  className={`led ${lane.mute ? '' : 'on'}`}
                  onClick={() => setLane(i, { mute: !lane.mute })}
                  aria-label={lane.mute ? 'Unmute track' : 'Mute track'}
                  data-hint="Mute or unmute everything on this playlist track"
                />
                {renaming === i ? (
                  <input
                    className="pl-name-input"
                    autoFocus
                    defaultValue={laneName(i)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
                    }}
                    onBlur={(e) => {
                      setLane(i, { name: e.target.value || laneName(i) });
                      setRenaming(null);
                    }}
                  />
                ) : (
                  <span
                    className="pl-name"
                    onDoubleClick={() => setRenaming(i)}
                    onPointerDown={(e) => lanePress.down(e, () => setRenaming(i))}
                    onPointerMove={(e) => lanePress.move(e)}
                    onPointerUp={() => lanePress.up()}
                    onPointerCancel={() => lanePress.up()}
                    data-hint="Double-click (or press and hold) to rename"
                  >
                    {laneName(i)}
                  </span>
                )}
              </div>
              <div
                className={`pl-lane ${lane.mute ? 'muted' : ''}`}
                data-lane={i}
                style={{ width: W }}
                onPointerDown={(e) => onLaneDown(e, i)}
                onDoubleClick={(e) => {
                  if (tool !== 'select') return;
                  importAt.current = { start: snapDown(beatAt(e.clientX, e.currentTarget), p.beatsPerBar), lane: i };
                  fileRef.current?.click();
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(DRAG_MIME) || e.dataTransfer.types.includes('Files')) e.preventDefault();
                }}
                onDrop={(e) => onDrop(e, i)}
                onContextMenu={(e) => e.preventDefault()}
              >
                {p.playlist
                  .filter((it) => it.lane === i)
                  .map((it) => {
                    const pat = it.kind === 'pattern' ? patternsById.get(it.patternId) : null;
                    const ch = it.kind === 'audio' ? p.tracks.find((t) => t.id === it.channelId) : null;
                    const color = pat?.color ?? ch?.color ?? '#888';
                    const name = pat?.name ?? (it.kind === 'audio' ? it.name : '?');
                    return (
                      <div
                        key={it.id}
                        className={`clip ${it.kind} ${s.selectedItemId === it.id ? 'sel' : ''}`}
                        style={{ left: it.start * ppb, width: Math.max(4, it.length * ppb), ['--clip' as string]: color }}
                        onPointerDown={(e) => onItemDown(e, it)}
                        onPointerMove={onItemMove}
                        onPointerUp={onItemUp}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          s.setUi({ dock: it.kind === 'pattern' ? 'rack' : 'roll', dockOpen: true });
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          // a finger gets the menu (Android long-press); the mouse deletes, like FL Studio
                          if (press.touch) {
                            if (!clipMenu) setClipMenu({ x: e.clientX, y: e.clientY, id: it.id });
                          } else removeItem(it.id);
                        }}
                        data-hint={it.kind === 'pattern' ? `${name} — double-click to edit, right-click to delete` : `${name} — audio clip, right-click to delete`}
                      >
                        <div className="clip-head">
                          <span>{name}</span>
                        </div>
                        <div className="clip-body">
                          {pat ? (
                            <PatternPreview pattern={pat} length={it.length} color={color} />
                          ) : it.kind === 'audio' ? (
                            <Waveform item={it} bpm={p.bpm} width={it.length * ppb} height={ROW - 22} color={color} />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
          <div className="playhead" ref={playheadRef} />
        </div>

        {empty && (
          <div className="pl-empty" style={{ left: HEAD + 24 }}>
            <Sparkles size={16} />
            <div>
              <b>Start here</b>
              <ol>
                <li>Click squares in the <b>Channel rack</b> below to make a beat (press <kbd>Space</kbd> to hear it).</li>
                <li>Click on this playlist to place the pattern, then switch to <b>SONG</b>.</li>
                <li>Or drag a beat or chord progression from the <b>Browser</b>, or pick a template in <b>File</b>.</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {clipMenu && <ClipMenu at={clipMenu} onClose={() => setClipMenu(null)} onDelete={removeItem} />}

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          const at = importAt.current;
          if (f && at) void importAudioFile(f, at);
        }}
      />
    </div>
  );
}

/** Clip options for touch screens (and anyone who long-presses). */
function ClipMenu({ at, onClose, onDelete }: { at: { x: number; y: number; id: string }; onClose: () => void; onDelete: (id: string) => void }) {
  const s = useStudio();
  const it = s.project.playlist.find((x) => x.id === at.id);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.clip-menu')) onClose();
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [onClose]);
  if (!it) return null;
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <div className="menu ctx clip-menu" style={menuPosition(at.x, at.y)}>
      <button
        onClick={act(() => {
          const c = cloneItem(it, it.start + it.length);
          s.edit((pr) => ({ ...pr, playlist: [...pr.playlist, c] }));
          s.setUi({ selectedItemId: c.id });
        })}
      >
        <Copy /> Duplicate after
      </button>
      {it.kind === 'pattern' && (
        <>
          <button onClick={act(() => s.setUi({ dock: 'rack', dockOpen: true }))}>
            <Grid3x3 /> Edit in channel rack
          </button>
          <button onClick={act(() => s.setUi({ dock: 'roll', dockOpen: true }))}>
            <Music2 /> Edit in piano roll
          </button>
          <button
            onClick={act(() =>
              s.edit((pr) => {
                const res = clonePattern(pr, it.patternId);
                if (!res) return pr;
                const [next, pat] = res;
                return mapItem(next, it.id, (x) => (x.kind === 'pattern' ? { ...x, patternId: pat.id } : x));
              }),
            )}
          >
            <Split /> Make unique
          </button>
        </>
      )}
      <button className="danger" onClick={act(() => onDelete(it.id))}>
        <Trash2 /> Delete
      </button>
    </div>
  );
}
