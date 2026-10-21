import { useEffect, useRef, useState } from 'react';
import {
  Circle,
  Download,
  FilePlus2,
  FolderOpen,
  Magnet,
  Pause,
  Play,
  Redo2,
  Repeat,
  Save,
  Scissors,
  Square,
  Timer,
  Undo2,
  ZoomIn,
} from 'lucide-react';
import { useStudio, findClip, splitClip, mapTrack, demoProject, emptyProject } from './store';
import { bounce, currentBeat, pause, play, record, seek, stop } from './playback';
import { Range } from '../components/ui';
import { download } from './buffers';
import type { Project } from './types';

export function formatPos(beats: number, bpb: number) {
  const bar = Math.floor(beats / bpb) + 1;
  const beat = Math.floor(beats % bpb) + 1;
  const six = Math.floor((beats % 1) * 4) + 1;
  return `${String(bar).padStart(3, ' ')}.${beat}.${six}`;
}
function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

const SNAPS = [
  { v: 4, label: 'Bar' },
  { v: 1, label: 'Beat' },
  { v: 0.5, label: '1/8' },
  { v: 0.25, label: '1/16' },
  { v: 0, label: 'Off' },
];

export function TransportBar() {
  const s = useStudio();
  const p = s.project;
  const posRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [bpmText, setBpmText] = useState(String(p.bpm));
  const [bouncing, setBouncing] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setBpmText(String(p.bpm)), [p.bpm]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const b = useStudio.getState().playing ? currentBeat() : useStudio.getState().cursor;
      const pr = useStudio.getState().project;
      if (posRef.current) posRef.current.textContent = formatPos(b, pr.beatsPerBar);
      if (timeRef.current) timeRef.current.textContent = formatTime((b * 60) / pr.bpm);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setP = (fn: (p: Project) => Project) => s.edit(fn);
  const commitBpm = () => {
    const v = Math.round(Math.max(30, Math.min(260, Number(bpmText) || p.bpm)));
    setBpmText(String(v));
    if (v !== p.bpm) setP((pr) => ({ ...pr, bpm: v }));
  };

  const split = () => {
    const found = findClip(p, s.selectedClipId);
    if (!found) return;
    const parts = splitClip(found.clip, s.cursor, p.bpm);
    if (!parts) return;
    s.edit((pr) =>
      mapTrack(pr, found.track.id, (t) => ({
        ...t,
        clips: t.clips.flatMap((c) => (c.id === found.clip.id ? parts : [c])),
      })),
    );
  };

  return (
    <div className="transport">
      <div className="row tp-group">
        <button className={`btn icon ${s.playing ? 'on' : ''}`} title="Play / pause (Space)" onClick={() => (s.playing ? pause() : void play())}>
          {s.playing ? <Pause /> : <Play />}
        </button>
        <button
          className="btn icon"
          title="Stop (press twice to return to start)"
          onClick={() => {
            if (!s.playing && !s.recording) seek(0);
            else stop();
          }}
        >
          <Square />
        </button>
        <button
          className={`btn icon rec ${s.recording ? 'on' : ''}`}
          title="Record (R arms the selected track)"
          onClick={() => (s.recording ? stop() : void record())}
        >
          <Circle fill="currentColor" />
        </button>
      </div>

      <div className="lcd">
        <div className="lcd-cell">
          <span className="lcd-label">Bar</span>
          <span className="mono lcd-value" ref={posRef}>
            1.1.1
          </span>
        </div>
        <div className="lcd-cell lcd-time">
          <span className="lcd-label">Time</span>
          <span className="mono lcd-value dim" ref={timeRef}>
            00:00.00
          </span>
        </div>
        <div className="lcd-cell">
          <span className="lcd-label">Tempo</span>
          <input
            className="mono lcd-input"
            value={bpmText}
            aria-label="Tempo in BPM"
            onChange={(e) => setBpmText(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={commitBpm}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const v = Math.max(30, Math.min(260, p.bpm + (e.key === 'ArrowUp' ? 1 : -1)));
                setP((pr) => ({ ...pr, bpm: v }));
              }
            }}
          />
        </div>
        <div className="lcd-cell">
          <span className="lcd-label">Sig</span>
          <select
            className="mono lcd-input"
            value={p.beatsPerBar}
            onChange={(e) => setP((pr) => ({ ...pr, beatsPerBar: Number(e.target.value) }))}
            aria-label="Beats per bar"
          >
            {[2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}/4
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row tp-group">
        <button
          className={`btn icon ${p.metronome ? 'on' : ''}`}
          title="Metronome"
          onClick={() => setP((pr) => ({ ...pr, metronome: !pr.metronome }))}
        >
          <Timer />
        </button>
        <button
          className={`btn sm ${p.countIn ? 'on' : ''}`}
          title="One-bar count-in before recording"
          onClick={() => setP((pr) => ({ ...pr, countIn: !pr.countIn }))}
        >
          Count-in
        </button>
        <button
          className={`btn icon ${p.loop.on ? 'on' : ''}`}
          title="Loop (drag on the ruler to set the region)"
          onClick={() => setP((pr) => ({ ...pr, loop: { ...pr.loop, on: !pr.loop.on } }))}
        >
          <Repeat />
        </button>
      </div>

      <div className="row tp-group tp-snap">
        <Magnet size={14} className="faint" />
        <select className="select" value={s.snap} onChange={(e) => s.setUi({ snap: Number(e.target.value) })} aria-label="Snap">
          {SNAPS.map((o) => (
            <option key={o.v} value={o.v}>
              Snap {o.label}
            </option>
          ))}
        </select>
        <ZoomIn size={14} className="faint" />
        <Range value={s.pxPerBeat} min={8} max={96} step={1} onChange={(v) => s.setUi({ pxPerBeat: v })} className="tp-zoom" ariaLabel="Zoom" />
      </div>

      <div className="row tp-group">
        <button className="btn icon ghost" title="Undo (Ctrl+Z)" disabled={!s.past.length} onClick={s.undo}>
          <Undo2 />
        </button>
        <button className="btn icon ghost" title="Redo (Ctrl+Shift+Z)" disabled={!s.future.length} onClick={s.redo}>
          <Redo2 />
        </button>
        <button className="btn icon ghost" title="Split selected clip at the cursor (Ctrl+E)" disabled={!s.selectedClipId} onClick={split}>
          <Scissors />
        </button>
      </div>

      <div className="spacer" />

      <input
        className="input tp-name"
        value={p.name}
        onChange={(e) => s.edit((pr) => ({ ...pr, name: e.target.value }), false)}
        aria-label="Project name"
        onKeyDown={(e) => e.stopPropagation()}
      />

      <div className="menu-wrap">
        <button className="btn" onClick={() => setMenu((m) => !m)}>
          <Save /> <span className="lbl">Project</span>
        </button>
        {menu && (
          <div className="menu" onMouseLeave={() => setMenu(false)}>
            <button
              onClick={() => {
                setMenu(false);
                if (confirm('Start a new empty session? Unsaved changes stay in undo history only until you leave.')) s.loadProject(emptyProject());
              }}
            >
              <FilePlus2 /> New empty session
            </button>
            <button
              onClick={() => {
                setMenu(false);
                s.loadProject(demoProject());
              }}
            >
              <FilePlus2 /> Load demo session
            </button>
            <button
              onClick={() => {
                setMenu(false);
                download(new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' }), `${p.name || 'session'}.sonare.json`);
              }}
            >
              <Save /> Save session file
            </button>
            <button
              onClick={() => {
                setMenu(false);
                fileRef.current?.click();
              }}
            >
              <FolderOpen /> Open session file
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const data = JSON.parse(await f.text()) as Project;
              if (!Array.isArray(data.tracks)) throw new Error('bad file');
              s.loadProject(data);
            } catch {
              alert('That file is not a Sonare session.');
            }
          }}
        />
      </div>

      <button
        className="btn primary"
        disabled={bouncing !== null}
        onClick={async () => {
          setBouncing(0);
          try {
            await bounce((f) => setBouncing(f));
          } finally {
            setBouncing(null);
          }
        }}
        title="Render the whole song to a WAV file (plays in real time)"
      >
        <Download /> <span className="lbl">{bouncing !== null ? `Exporting ${Math.round(bouncing * 100)}%` : 'Export WAV'}</span>
      </button>
    </div>
  );
}
