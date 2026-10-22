import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Eraser, Gauge, Piano, Plus, Trash2, Mic, Circle } from 'lucide-react';
import {
  useStudio,
  currentPattern,
  setChannelNotes,
  mapPattern,
  mapTrack,
  newPattern,
  clonePattern,
  addChannel,
  removeChannel,
  channelKind,
  uid,
  addAutomation,
} from './store';
import { AUTO_PARAMS } from './automation';
import { audition, currentBeat } from './playback';
import type { Note, Pattern, Track } from './types';
import { InstrumentSelect, readDrag, DRAG_MIME } from './common';
import { presetById } from './presets';
import { DRUM_PIECES, displayName } from '../lib/instruments';
import { InstrumentBrowser } from '../components/PlayParts';
import { Knob } from '../components/ui';
import { useMobile } from '../lib/useMobile';
import { createLongPress, menuPosition } from '../lib/longPress';

// drum-machine order, most used first
const PIECE_ORDER = ['bass', 'snare-drum', 'snare-stick', 'hihat', 'hihat-open', 'hihat-foot', 'crash', 'ride', 'tom1', 'tom2', 'floor-tom'];
const DEFAULT_PIECES = new Set(['bass', 'snare-drum', 'hihat', 'hihat-open', 'crash']);
const PIECE_LABEL: Record<string, string> = {
  bass: 'Kick', 'snare-drum': 'Snare', 'snare-stick': 'Rim', hihat: 'Closed hat', 'hihat-open': 'Open hat',
  'hihat-foot': 'Pedal hat', crash: 'Crash', ride: 'Ride', tom1: 'High tom', tom2: 'Mid tom', 'floor-tom': 'Floor tom',
};
const STEP_EPS = 1e-3;

/** Pitch a melodic channel's steps use: its notes' pitch if they're all the same, else middle C. */
function stepPitch(notes: Note[]) {
  const set = new Set(notes.map((n) => n.pitch));
  return set.size === 1 ? [...set][0] : 60;
}
const isStepLike = (notes: Note[]) =>
  new Set(notes.map((n) => n.pitch)).size <= 1 && notes.every((n) => Math.abs(n.start * 4 - Math.round(n.start * 4)) < 0.01 && n.dur <= 0.5);

export function ChannelRack() {
  const s = useStudio();
  const mobile = useMobile();
  const p = s.project;
  const pat = currentPattern(p);
  const steps = Math.max(1, Math.round(pat.length * 4));
  const HEAD = mobile ? 112 : 252;
  const STEP = mobile ? 28 : 24;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [dropHot, setDropHot] = useState(false);
  const playRef = useRef<HTMLDivElement>(null);
  const paint = useRef<{ on: boolean; last: string } | null>(null);
  const [velMode, setVelMode] = useState(false);
  const namePress = useRef(createLongPress()).current;

  // step playhead
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const st = useStudio.getState();
      const pr = st.project;
      const cp = currentPattern(pr);
      let b = -1;
      if (st.playing) {
        const now = currentBeat();
        if (pr.mode === 'pattern') b = now;
        else {
          const it = pr.playlist.find((x) => x.kind === 'pattern' && x.patternId === cp.id && now >= x.start && now < x.start + x.length);
          if (it) b = (now - it.start) % cp.length;
        }
      }
      if (playRef.current) {
        const step = Math.floor(b * 4);
        playRef.current.style.display = b >= 0 ? 'block' : 'none';
        playRef.current.style.transform = `translateX(${step * STEP}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [STEP]);

  /* ------------------------------------------------------------ steps */
  const hasStep = (pt: Pattern, ch: string, pitch: number, step: number) =>
    (pt.notes[ch] ?? []).some((n) => n.pitch === pitch && Math.abs(n.start - step * 0.25) < STEP_EPS);

  const setStep = (ch: string, pitch: number, step: number, on: boolean) => {
    s.edit(
      (pr) =>
        setChannelNotes(pr, currentPattern(pr).id, ch, (ns) => {
          const has = ns.some((n) => n.pitch === pitch && Math.abs(n.start - step * 0.25) < STEP_EPS);
          if (on && !has) return [...ns, { id: uid(), pitch, start: step * 0.25, dur: 0.25, vel: 0.85 }];
          if (!on && has) return ns.filter((n) => !(n.pitch === pitch && Math.abs(n.start - step * 0.25) < STEP_EPS));
          return ns;
        }),
      false,
    );
  };

  const stepNote = (pt: Pattern, ch: string, pitch: number, step: number) =>
    (pt.notes[ch] ?? []).find((n) => n.pitch === pitch && Math.abs(n.start - step * 0.25) < STEP_EPS);

  /** Velocity mode: the pointer's height inside a step sets how hard it hits (adds the step if empty). */
  const setStepVel = (ch: string, pitch: number, step: number, vel: number) =>
    s.edit(
      (pr) =>
        setChannelNotes(pr, currentPattern(pr).id, ch, (ns) => {
          const has = ns.some((n) => n.pitch === pitch && Math.abs(n.start - step * 0.25) < STEP_EPS);
          if (!has) return [...ns, { id: uid(), pitch, start: step * 0.25, dur: 0.25, vel }];
          return ns.map((n) => (n.pitch === pitch && Math.abs(n.start - step * 0.25) < STEP_EPS ? { ...n, vel } : n));
        }),
      false,
    );
  const velAt = (el: Element, y: number) => {
    const r = el.getBoundingClientRect();
    return Math.round(Math.max(0.05, Math.min(1, 1 - (y - r.top) / r.height)) * 100) / 100;
  };

  const stepFromPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-step]');
    if (!el) return null;
    return { ch: el.dataset.ch!, pitch: Number(el.dataset.pitch), step: Number(el.dataset.step), el };
  };

  const onStepsDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const hit = stepFromPoint(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    if (velMode) {
      s.checkpoint();
      setStepVel(hit.ch, hit.pitch, hit.step, velAt(hit.el, e.clientY));
      paint.current = { on: true, last: '' };
      s.setUi({ selectedTrackId: hit.ch });
      return;
    }
    const on = !hasStep(pat, hit.ch, hit.pitch, hit.step);
    s.checkpoint();
    setStep(hit.ch, hit.pitch, hit.step, on);
    if (on) audition(hit.ch, hit.pitch, 0.85);
    paint.current = { on, last: `${hit.ch}:${hit.pitch}:${hit.step}` };
    s.setUi({ selectedTrackId: hit.ch });
  };
  const onStepsMove = (e: React.PointerEvent) => {
    const d = paint.current;
    if (!d) return;
    const hit = stepFromPoint(e.clientX, e.clientY);
    if (!hit) return;
    if (velMode) {
      setStepVel(hit.ch, hit.pitch, hit.step, velAt(hit.el, e.clientY));
      return;
    }
    const key = `${hit.ch}:${hit.pitch}:${hit.step}`;
    if (key === d.last) return;
    d.last = key;
    setStep(hit.ch, hit.pitch, hit.step, d.on);
  };
  const onStepsUp = () => {
    paint.current = null;
  };

  const stepCells = (ch: Track, pitch: number) => (
    <div className="cr-cells" style={{ width: steps * STEP }}>
      {Array.from({ length: steps }).map((_, i) => {
        const n = stepNote(pat, ch.id, pitch, i);
        return (
          <div
            key={i}
            data-step={i}
            data-ch={ch.id}
            data-pitch={pitch}
            className={`cr-step ${n ? 'on' : ''} ${Math.floor(i / 4) % 2 ? 'alt' : ''}`}
            style={{ width: STEP, ['--clip' as string]: ch.color, ['--v' as string]: `${Math.round((n?.vel ?? 1) * 100)}%` }}
          />
        );
      })}
    </div>
  );

  const miniRoll = (ch: Track, notes: Note[]) => {
    const pitches = notes.map((n) => n.pitch);
    const lo = Math.min(...pitches) - 1;
    const hi = Math.max(...pitches) + 1;
    const span = Math.max(6, hi - lo);
    return (
      <button
        className="cr-roll"
        style={{ width: steps * STEP, ['--clip' as string]: ch.color }}
        onClick={() => s.setUi({ selectedTrackId: ch.id, dock: 'roll', dockOpen: true })}
        data-hint="This channel has a melody — click to edit it in the piano roll"
      >
        <svg viewBox={`0 0 ${pat.length * 100} 100`} preserveAspectRatio="none">
          {notes.map((n) =>
            n.start < pat.length ? (
              <rect
                key={n.id}
                x={n.start * 100}
                y={((hi - n.pitch) / span) * 100 - 100 / span / 2}
                width={Math.max(6, Math.min(n.dur, pat.length - n.start) * 100 - 4)}
                height={Math.max(4, 100 / span - 2)}
                fill={ch.color}
              />
            ) : null,
          )}
        </svg>
      </button>
    );
  };

  /* ------------------------------------------------------------ rows */
  const up = (id: string, patch: Partial<Track>, record = true) => s.edit((pr) => mapTrack(pr, id, (t) => ({ ...t, ...patch })), record);

  const head = (ch: Track, extra?: React.ReactNode) => {
    const sel = s.selectedTrackId === ch.id;
    return (
      <div className={`cr-head ${sel ? 'sel' : ''}`} style={{ width: HEAD }}>
        <button
          className={`led ${ch.mute ? '' : 'on'}`}
          onClick={() => up(ch.id, { mute: !ch.mute })}
          aria-label={ch.mute ? 'Unmute channel' : 'Mute channel'}
          data-hint="Mute / unmute this channel"
        />
        {!mobile && (
          <div className="cr-knobs">
            <Knob size={22} value={ch.pan} min={-1} max={1} bipolar defaultValue={0} onStart={() => s.checkpoint()} onChange={(v) => up(ch.id, { pan: v }, false)} label="" />
            <Knob size={22} value={ch.volume} min={-40} max={6} defaultValue={-6} onStart={() => s.checkpoint()} onChange={(v) => up(ch.id, { volume: v }, false)} label="" />
          </div>
        )}
        <button
          className="cr-name"
          style={{ ['--clip' as string]: ch.color }}
          onClick={() => s.setUi({ selectedTrackId: ch.id })}
          onPointerDown={(e) => namePress.down(e, (x, y) => setMenu({ x, y, id: ch.id }))}
          onPointerMove={(e) => namePress.move(e)}
          onPointerUp={() => namePress.up()}
          onPointerCancel={() => namePress.up()}
          onDoubleClick={() => s.setUi({ selectedTrackId: ch.id, dock: ch.kind === 'audio' ? 'mixer' : 'roll', dockOpen: true })}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, id: ch.id });
          }}
          data-hint={`${ch.name} (${ch.kind === 'audio' ? 'audio input' : displayName(ch.instrumentId)}) — click to select and play it, double-click for the piano roll, right-click or press and hold for options`}
        >
          {ch.kind === 'audio' && <Mic size={11} />}
          <span>{ch.name}</span>
        </button>
        {extra}
        <span className={`cr-selbox ${sel ? 'on' : ''}`} />
      </div>
    );
  };

  const rows: React.ReactNode[] = [];
  for (const ch of p.tracks) {
    const notes = pat.notes[ch.id] ?? [];
    if (ch.kind === 'drums') {
      const used = new Set(notes.map((n) => n.pitch));
      const open = expanded[ch.id];
      const pieces = PIECE_ORDER.map((k) => DRUM_PIECES.find((x) => x.key === k)!).filter(
        (pc) => open || DEFAULT_PIECES.has(pc.key) || used.has(pc.midi),
      );
      rows.push(
        <div key={ch.id} className="cr-row group">
          {head(
            ch,
            <button
              className="btn sm icon ghost cr-expand"
              onClick={() => setExpanded((x) => ({ ...x, [ch.id]: !open }))}
              data-hint={open ? 'Show only the main drums' : 'Show every drum in the kit'}
            >
              {open ? <ChevronUp /> : <ChevronDown />}
            </button>,
          )}
          <div className="cr-group-label faint" style={{ width: steps * STEP }}>
            {displayName(ch.instrumentId)} · {pieces.length} of {DRUM_PIECES.length} drums
          </div>
        </div>,
      );
      for (const pc of pieces)
        rows.push(
          <div key={`${ch.id}-${pc.key}`} className="cr-row piece">
            <div className="cr-head piece" style={{ width: HEAD }}>
              <button className="cr-piece" onClick={() => audition(ch.id, pc.midi)} data-hint={`${PIECE_LABEL[pc.key]} — click to hear it`}>
                {PIECE_LABEL[pc.key]}
              </button>
            </div>
            {stepCells(ch, pc.midi)}
          </div>,
        );
    } else if (ch.kind === 'instrument') {
      rows.push(
        <div key={ch.id} className="cr-row">
          {head(ch)}
          {notes.length && !isStepLike(notes) ? miniRoll(ch, notes) : stepCells(ch, stepPitch(notes))}
        </div>,
      );
    } else {
      rows.push(
        <div key={ch.id} className="cr-row audio">
          {head(
            ch,
            <button
              className={`btn sm icon rec ${ch.arm ? 'on' : ''}`}
              onClick={() => up(ch.id, { arm: !ch.arm })}
              data-hint="Arm this audio channel, then press Record to sing or play into your microphone"
            >
              <Circle fill="currentColor" />
            </button>,
          )}
          <div className="cr-group-label faint" style={{ width: steps * STEP }}>
            Audio channel — arm it and press record, or drop audio files on the playlist
          </div>
        </div>,
      );
    }
  }

  /* ------------------------------------------------------- pattern ops */
  const idx = p.patterns.findIndex((x) => x.id === pat.id);
  const go = (d: number) => {
    const next = p.patterns[(idx + d + p.patterns.length) % p.patterns.length];
    s.edit((pr) => ({ ...pr, currentPatternId: next.id }), false);
  };

  const menuCh = menu ? p.tracks.find((t) => t.id === menu.id) : null;

  return (
    <div
      className={`cr ${dropHot ? 'drop' : ''}`}
      onPointerDown={() => menu && setMenu(null)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
          e.preventDefault();
          setDropHot(true);
        }
      }}
      onDragLeave={() => setDropHot(false)}
      onDrop={(e) => {
        setDropHot(false);
        const d = readDrag(e);
        if (!d) return;
        e.preventDefault();
        if (d.type === 'instrument') {
          let id = '';
          s.edit((pr) => {
            const [next, ch] = addChannel(pr, channelKind(d.id), d.id);
            id = ch.id;
            return next;
          });
          s.setUi({ selectedTrackId: id });
        } else {
          const pre = presetById(d.id);
          if (!pre) return;
          // a preset dropped on the rack fills the current pattern
          const wantDrums = pre.category === 'drums';
          let ch = p.tracks.find((t) => t.id === s.selectedTrackId && (wantDrums ? t.kind === 'drums' : t.kind === 'instrument'));
          ch ??= p.tracks.find((t) => (wantDrums ? t.kind === 'drums' : t.kind === 'instrument'));
          s.edit((pr) => {
            let next = pr;
            let target = ch;
            if (!target) {
              const inst = wantDrums ? 'kit:standard-kit' : 'studio-acoustic-grand-piano';
              [next, target] = addChannel(next, wantDrums ? 'drums' : 'instrument', inst);
            }
            const tid = target.id;
            next = mapPattern(next, pat.id, (x) => ({ ...x, length: Math.max(x.length, pre.bars * pr.beatsPerBar) }));
            return setChannelNotes(next, pat.id, tid, () => pre.build().map((n) => ({ ...n, id: uid() })));
          });
        }
      }}
    >
      <div className="cr-bar">
        <span className="pl-title">Channel rack</span>
        <div className="cr-pattern" data-hint="The pattern you're editing — every channel's steps belong to it">
          <button className="btn sm icon ghost" onClick={() => go(-1)} aria-label="Previous pattern">
            <ChevronLeft />
          </button>
          <i style={{ background: pat.color }} />
          <select
            className="select"
            value={pat.id}
            onChange={(e) => s.edit((pr) => ({ ...pr, currentPatternId: e.target.value }), false)}
            aria-label="Pattern"
          >
            {p.patterns.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <button className="btn sm icon ghost" onClick={() => go(1)} aria-label="Next pattern">
            <ChevronRight />
          </button>
        </div>
        <button className="btn sm" onClick={() => s.edit((pr) => newPattern(pr)[0])} data-hint="Make a new empty pattern">
          <Plus /> New
        </button>
        <button className="btn sm" onClick={() => s.edit((pr) => clonePattern(pr, pat.id)?.[0] ?? pr)} data-hint="Copy this pattern so you can make a variation">
          <Copy /> Clone
        </button>
        <select
          className="select"
          value={pat.length}
          onChange={(e) => s.edit((pr) => mapPattern(pr, pat.id, (x) => ({ ...x, length: Number(e.target.value) })))}
          aria-label="Pattern length"
          data-hint="How long this pattern is before it repeats"
        >
          {[1, 2, 4, 8].map((b) => (
            <option key={b} value={b * p.beatsPerBar}>
              {b} bar{b > 1 ? 's' : ''} · {b * 16} steps
            </option>
          ))}
        </select>
        <div className="cr-swing" data-hint="Swing: delays every second 16th for a shuffled groove">
          <Knob size={26} value={pat.swing} min={0} max={1} defaultValue={0} onStart={() => s.checkpoint()} onChange={(v) => s.edit((pr) => mapPattern(pr, pat.id, (x) => ({ ...x, swing: v })), false)} label="" />
          <span className="cr-swing-label">Swing {Math.round(pat.swing * 100)}%</span>
        </div>
        <button
          className={`btn sm ${velMode ? 'on' : ''}`}
          onClick={() => setVelMode((v) => !v)}
          data-hint="Velocity mode: drag up and down inside the steps to make hits louder or softer"
        >
          <Gauge /> Velocity
        </button>
        <button
          className="btn sm ghost"
          onClick={() => {
            if (confirm(`Clear every note in ${pat.name}?`)) s.edit((pr) => mapPattern(pr, pat.id, (x) => ({ ...x, notes: {} })));
          }}
          data-hint="Remove every note from this pattern"
        >
          <Eraser /> Clear
        </button>
        <div className="spacer" />
        <div className="menu-wrap">
          <button className="btn sm primary" onClick={() => setAdding((a) => !a)} data-hint="Add an instrument, drum kit or audio channel">
            <Plus /> Channel
          </button>
          {adding && (
            <div className="menu cr-add" onMouseLeave={() => setAdding(false)}>
              <button
                onClick={() => {
                  setAdding(false);
                  s.edit((pr) => addChannel(pr, 'audio', '', 'Audio')[0]);
                }}
              >
                <Mic /> Audio / vocal channel
              </button>
              <div className="cr-add-list">
                <InstrumentBrowser
                  inSheet
                  value=""
                  onPick={(id) => {
                    setAdding(false);
                    let nid = '';
                    s.edit((pr) => {
                      const [next, ch] = addChannel(pr, channelKind(id), id);
                      nid = ch.id;
                      return next;
                    });
                    s.setUi({ selectedTrackId: nid });
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="cr-scroll">
        <div className="cr-grid" style={{ ['--head' as string]: `${HEAD}px` }}>
          <div className={`cr-steps-wrap cr-steps ${velMode ? 'vel-mode' : ''}`} onPointerDown={onStepsDown} onPointerMove={onStepsMove} onPointerUp={onStepsUp} onPointerCancel={onStepsUp}>
            {rows}
            <div className="cr-play" ref={playRef} style={{ left: HEAD, width: STEP }} />
          </div>
          {!p.tracks.length && <div className="empty">No channels yet — add one with “+ Channel” or drag an instrument here.</div>}
          {!mobile && (
            <div className="cr-foot faint" style={{ paddingLeft: HEAD }}>
              Click or drag across the squares to paint a beat · press <kbd>Space</kbd> to loop this pattern (PAT mode)
            </div>
          )}
        </div>
      </div>

      {menu && menuCh && (
        <div className="menu ctx" style={menuPosition(menu.x, menu.y, 260, 260)} onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              const name = prompt('Channel name', menuCh.name);
              if (name) up(menuCh.id, { name });
              setMenu(null);
            }}
          >
            Rename…
          </button>
          {menuCh.kind !== 'audio' && (
            <div className="menu-field">
              <span className="faint">Instrument</span>
              <InstrumentSelect
                value={menuCh.instrumentId}
                onChange={(id) => {
                  up(menuCh.id, {
                    instrumentId: id,
                    kind: channelKind(id),
                    name: menuCh.name === displayName(menuCh.instrumentId) ? displayName(id) : menuCh.name,
                  });
                  setMenu(null);
                }}
              />
            </div>
          )}
          {menuCh.kind !== 'audio' && (
            <button
              onClick={() => {
                s.setUi({ selectedTrackId: menuCh.id, dock: 'roll', dockOpen: true });
                setMenu(null);
              }}
            >
              <Piano /> Open piano roll
            </button>
          )}
          <div className="menu-heading">Automate</div>
          <div className="menu-chips">
            {AUTO_PARAMS.map((a) => (
              <button
                key={a.id}
                className="btn sm"
                onClick={() => {
                  let id = '';
                  s.edit((pr) => {
                    const start = Math.floor(s.cursor / pr.beatsPerBar) * pr.beatsPerBar;
                    const [next, item] = addAutomation(pr, menuCh.id, a.id, start, 4 * pr.beatsPerBar);
                    id = item.id;
                    return next;
                  });
                  s.setUi({ selectedItemId: id, dock: 'roll', dockOpen: true });
                  setMenu(null);
                }}
                data-hint={`Draw how ${a.label.toLowerCase()} changes over the song`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              up(menuCh.id, { arm: !menuCh.arm });
              setMenu(null);
            }}
          >
            <Circle /> {menuCh.arm ? 'Disarm' : 'Arm for recording'}
          </button>
          <button
            className="danger"
            onClick={() => {
              if (confirm(`Delete ${menuCh.name} and its notes in every pattern?`)) s.edit((pr) => removeChannel(pr, menuCh.id));
              setMenu(null);
            }}
          >
            <Trash2 /> Delete channel
          </button>
        </div>
      )}
    </div>
  );
}
