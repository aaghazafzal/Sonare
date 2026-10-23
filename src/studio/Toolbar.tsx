import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  FolderTree,
  Grid3x3,
  Magnet,
  Pause,
  Piano,
  Play,
  Plus,
  Redo2,
  Repeat,
  SlidersHorizontal,
  Square,
  Timer,
  Undo2,
  ZoomIn,
  Music2,
  HelpCircle,
  Menu as MenuIcon,
} from 'lucide-react';
import {
  useStudio,
  currentPattern,
  newPattern,
  clonePattern,
  deletePattern,
  mapPattern,
  addChannel,
  fromTemplate,
  TEMPLATE_LIST,
  cloneItem,
  addAutomation,
  type DockTab,
} from './store';
import { bounce, currentBeat, pause, play, record, seek, stop, setMode } from './playback';
import { exportMix, exportStems, type ExportFormat } from './render';
import { exportMidi, importMidi } from './midi';
import { Segmented, Sheet } from '../components/ui';
import { exportSessionFile, importSessionFile, startProject } from './projects';
import { ProjectsPanel, SaveStatus } from './ProjectsPanel';
import { useHint } from './common';
import { FullscreenButton, Range } from '../components/ui';
import { useMobile } from '../lib/useMobile';
import type { Project } from './types';

export function formatPos(beats: number, bpb: number) {
  const bar = Math.floor(beats / bpb) + 1;
  const beat = Math.floor(beats % bpb) + 1;
  const tick = Math.floor((beats % 1) * 96);
  return `${bar}:${String(beat).padStart(2, '0')}:${String(tick).padStart(2, '0')}`;
}

const SNAPS = [
  { v: 4, label: 'Bar' },
  { v: 1, label: 'Beat' },
  { v: 0.5, label: '1/8' },
  { v: 0.25, label: '1/16' },
  { v: 0, label: 'None' },
];

type MenuItem = { label: string; hint?: string; key?: string; on?: boolean; disabled?: boolean; run: () => void } | 'sep' | { heading: string };

function MenuBar({ menus }: { menus: { label: string; items: MenuItem[] }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <div className="fl-menubar" ref={ref}>
      {menus.map((m) => (
        <div key={m.label} className="menu-wrap">
          <button
            className={`fl-menu-btn ${open === m.label ? 'on' : ''}`}
            onClick={() => setOpen(open === m.label ? null : m.label)}
            onMouseEnter={() => open && setOpen(m.label)}
          >
            {m.label}
          </button>
          {open === m.label && (
            <div className="menu fl-menu">
              {m.items.map((it, i) =>
                it === 'sep' ? (
                  <div key={i} className="menu-sep" />
                ) : 'heading' in it ? (
                  <div key={i} className="menu-heading">
                    {it.heading}
                  </div>
                ) : (
                  <button
                    key={i}
                    disabled={it.disabled}
                    className={it.on ? 'checked' : ''}
                    onClick={() => {
                      setOpen(null);
                      it.run();
                    }}
                    data-hint={it.hint}
                  >
                    <span className="menu-check">{it.on ? '✓' : ''}</span>
                    {it.label}
                    {it.key && <kbd>{it.key}</kbd>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Phones: every menu in one sheet instead of a menu bar. */
function MenuSheet({ menus }: { menus: { label: string; items: MenuItem[] }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn icon fl-menu-toggle" onClick={() => setOpen(true)} aria-label="Menu">
        <MenuIcon />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Studio menu" tall>
        <div className="m-menus">
          {menus.map((m) => (
            <section key={m.label}>
              <h4>{m.label}</h4>
              {m.items.map((it, i) =>
                it === 'sep' ? null : 'heading' in it ? (
                  <div key={i} className="m-menu-heading faint">
                    {it.heading}
                  </div>
                ) : (
                  <button
                    key={i}
                    className={`m-menu-item ${it.on ? 'checked' : ''}`}
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(false);
                      it.run();
                    }}
                  >
                    <span className="menu-check">{it.on ? '✓' : ''}</span>
                    <span className="m-menu-label">
                      {it.label}
                      {it.hint && <small className="faint">{it.hint}</small>}
                    </span>
                  </button>
                ),
              )}
            </section>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-root" onPointerDown={onClose}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const GUIDE: { title: string; text: string }[] = [
  { title: 'Make a beat', text: 'In the Channel rack, click squares on the Kick, Snare and hat rows. Make sure PAT is on and press Space — the pattern loops while you edit.' },
  { title: 'Add sounds', text: 'Open the Browser (left) and click an instrument, or drag a ready-made beat, bass line or chord progression onto the playlist.' },
  { title: 'Write melodies', text: 'Select a channel and open the Piano roll (F7). Click to draw notes, drag to move, drag the right edge to make them longer. Your computer keys and MIDI keyboard play the selected channel.' },
  { title: 'Arrange the song', text: 'Choose a pattern in the toolbar, then click on the Playlist to place it. Right-click a clip to delete it, Alt-drag to copy. Switch to SONG to play the whole arrangement.' },
  { title: 'Record vocals', text: 'Arm the Vocals channel (red dot) and press Record. A one-bar count-in plays, then sing. Your take appears on the playlist.' },
  { title: 'Mix and export', text: 'Open the Mixer (F9) for volume, pan, EQ, compressor, reverb and delay on each channel. When it sounds right, use Export (WAV, MP3 or stems).' },
];

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['F5 / F6 / F7 / F9', 'Playlist / Channel rack / Piano roll / Mixer'],
  ['F8', 'Browser'],
  ['Ctrl Z · Ctrl Shift Z', 'Undo · redo'],
  ['Ctrl D', 'Duplicate selected clip'],
  ['Del', 'Delete selected clip or notes'],
  ['Home', 'Back to the start'],
  ['Right-click', 'Delete a playlist clip'],
  ['Alt-drag', 'Copy a clip'],
  ['Shift-drag', 'Select several notes in the piano roll'],
];

export function Toolbar() {
  const s = useStudio();
  const p = s.project;
  const mobile = useMobile();
  const pat = currentPattern(p);
  const posRef = useRef<HTMLSpanElement>(null);
  const [bpmText, setBpmText] = useState(String(p.bpm));
  const [modal, setModal] = useState<'guide' | 'keys' | 'projects' | 'export' | null>(() => (openGuideOnce() ? 'guide' : null));
  const fileRef = useRef<HTMLInputElement>(null);
  const midiRef = useRef<HTMLInputElement>(null);
  const hint = useHint((h) => h.text);

  useEffect(() => setBpmText(String(p.bpm)), [p.bpm]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const st = useStudio.getState();
      const pr = st.project;
      const b = st.playing ? currentBeat() : pr.mode === 'pattern' ? 0 : st.cursor;
      if (posRef.current) posRef.current.textContent = formatPos(b, pr.beatsPerBar);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setP = (fn: (p: Project) => Project, record = true) => s.edit(fn, record);
  const commitBpm = () => {
    const v = Math.round(Math.max(30, Math.min(260, Number(bpmText) || p.bpm)));
    setBpmText(String(v));
    if (v !== p.bpm) setP((pr) => ({ ...pr, bpm: v }));
  };
  const view = (d: DockTab) => s.setUi(s.dock === d && s.dockOpen ? { dockOpen: false } : { dock: d, dockOpen: true });
  const doExport = () => setModal('export');
  const selItem = p.playlist.find((x) => x.id === s.selectedItemId);
  const idx = p.patterns.findIndex((x) => x.id === pat.id);
  const goPattern = (d: number) => setP((pr) => ({ ...pr, currentPatternId: pr.patterns[(idx + d + pr.patterns.length) % pr.patterns.length].id }), false);

  const menus: { label: string; items: MenuItem[] }[] = [
    {
      label: 'File',
      items: [
        { label: 'My projects…', hint: 'Every project saved in this browser', run: () => setModal('projects') },
        'sep',
        { heading: 'New project' },
        ...TEMPLATE_LIST.map((t) => ({
          label: t.name,
          hint: `${t.hint} — your current project stays saved in My projects`,
          run: () => void startProject(fromTemplate(t.id)),
        })),
        'sep',
        { label: 'Open session file…', run: () => fileRef.current?.click() },
        { label: 'Save session file (with recordings)', hint: 'One file with the whole project and its audio — for backups or another device', run: () => void exportSessionFile(p) },
        'sep',
        { label: 'Export audio…', hint: 'WAV or MP3 of the whole song, or one file per channel (stems)', run: doExport },
        'sep',
        { label: 'Import MIDI file…', hint: 'Bring in a .mid — it becomes a new pattern with one channel per MIDI track', run: () => midiRef.current?.click() },
        { label: 'Export song as MIDI', run: () => exportMidi(p, 'song') },
        { label: `Export “${pat.name}” as MIDI`, run: () => exportMidi(p, 'pattern') },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', key: 'Ctrl Z', disabled: !s.past.length, run: s.undo },
        { label: 'Redo', key: 'Ctrl ⇧ Z', disabled: !s.future.length, run: s.redo },
        'sep',
        {
          label: 'Duplicate selected clip',
          key: 'Ctrl D',
          disabled: !selItem,
          run: () => selItem && setP((pr) => ({ ...pr, playlist: [...pr.playlist, cloneItem(selItem, selItem.start + selItem.length)] })),
        },
        {
          label: 'Delete selected clip',
          key: 'Del',
          disabled: !selItem,
          run: () => selItem && setP((pr) => ({ ...pr, playlist: pr.playlist.filter((x) => x.id !== selItem.id) })),
        },
      ],
    },
    {
      label: 'Add',
      items: [
        { label: 'Instrument channel', run: () => setP((pr) => addChannel(pr, 'instrument', 'studio-acoustic-grand-piano')[0]) },
        { label: 'Drum kit channel', run: () => setP((pr) => addChannel(pr, 'drums', 'kit:standard-kit', 'Drums')[0]) },
        { label: 'Audio / vocal channel', run: () => setP((pr) => addChannel(pr, 'audio', '', 'Audio')[0]) },
        'sep',
        { label: 'New pattern', run: () => setP((pr) => newPattern(pr)[0]) },
        'sep',
        { heading: 'Automation clip' },
        {
          label: s.selectedTrackId ? `Volume of ${p.tracks.find((t) => t.id === s.selectedTrackId)?.name ?? 'channel'}` : 'Channel volume',
          disabled: !s.selectedTrackId,
          hint: 'A curve that changes the selected channel over time (more options: right-click a channel)',
          run: () => {
            let id = '';
            setP((pr) => {
              const [next, item] = addAutomation(pr, s.selectedTrackId!, 'volume', Math.floor(s.cursor / pr.beatsPerBar) * pr.beatsPerBar, 4 * pr.beatsPerBar);
              id = item.id;
              return next;
            });
            s.setUi({ selectedItemId: id, dock: 'roll', dockOpen: true });
          },
        },
        {
          label: 'Master volume (fade in / out)',
          run: () => {
            let id = '';
            setP((pr) => {
              const [next, item] = addAutomation(pr, 'master', 'volume', Math.floor(s.cursor / pr.beatsPerBar) * pr.beatsPerBar, 4 * pr.beatsPerBar);
              id = item.id;
              return next;
            });
            s.setUi({ selectedItemId: id, dock: 'roll', dockOpen: true });
          },
        },
      ],
    },
    {
      label: 'Patterns',
      items: [
        { label: 'New pattern', run: () => setP((pr) => newPattern(pr)[0]) },
        { label: `Clone “${pat.name}”`, run: () => setP((pr) => clonePattern(pr, pat.id)?.[0] ?? pr) },
        {
          label: 'Rename…',
          run: () => {
            const n = prompt('Pattern name', pat.name);
            if (n) setP((pr) => mapPattern(pr, pat.id, (x) => ({ ...x, name: n })));
          },
        },
        { label: 'Clear notes', run: () => setP((pr) => mapPattern(pr, pat.id, (x) => ({ ...x, notes: {} }))) },
        {
          label: 'Delete pattern',
          disabled: p.patterns.length <= 1,
          run: () => {
            if (confirm(`Delete “${pat.name}” and its clips from the playlist?`)) setP((pr) => deletePattern(pr, pat.id));
          },
        },
        'sep',
        { heading: 'Length' },
        ...[1, 2, 4, 8].map((b) => ({
          label: `${b} bar${b > 1 ? 's' : ''}`,
          on: pat.length === b * p.beatsPerBar,
          run: () => setP((pr) => mapPattern(pr, pat.id, (x) => ({ ...x, length: b * pr.beatsPerBar }))),
        })),
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Browser', key: 'F8', on: s.browserOpen, run: () => s.setUi({ browserOpen: !s.browserOpen }) },
        { label: 'Channel rack', key: 'F6', on: s.dockOpen && s.dock === 'rack', run: () => view('rack') },
        { label: 'Piano roll', key: 'F7', on: s.dockOpen && s.dock === 'roll', run: () => view('roll') },
        { label: 'Mixer', key: 'F9', on: s.dockOpen && s.dock === 'mixer', run: () => view('mixer') },
        { label: 'Play instrument', on: s.dockOpen && s.dock === 'instrument', run: () => view('instrument') },
      ],
    },
    {
      label: 'Options',
      items: [
        { label: 'Metronome', on: p.metronome, run: () => setP((pr) => ({ ...pr, metronome: !pr.metronome })) },
        { label: 'Count-in before recording', on: p.countIn, run: () => setP((pr) => ({ ...pr, countIn: !pr.countIn })) },
        { label: 'Loop region (song mode)', on: p.loop.on, run: () => setP((pr) => ({ ...pr, loop: { ...pr.loop, on: !pr.loop.on } })) },
        'sep',
        { heading: 'Snap' },
        ...SNAPS.map((o) => ({ label: o.label, on: s.snap === o.v, run: () => s.setUi({ snap: o.v }) })),
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Quick start guide', run: () => setModal('guide') },
        { label: 'Keyboard shortcuts', run: () => setModal('keys') },
      ],
    },
  ];

  const viewBtn = (d: DockTab, icon: ReactNode, label: string, hintText: string) => (
    <button className={`fl-view ${s.dockOpen && s.dock === d ? 'on' : ''}`} onClick={() => view(d)} data-hint={hintText} aria-label={label}>
      {icon}
    </button>
  );

  return (
    <div className="fl-toolbar">
      {mobile === 'portrait' ? <MenuSheet menus={menus} /> : <MenuBar menus={menus} />}

      <div className="fl-mode" data-hint="PAT loops the selected pattern · SONG plays the whole playlist">
        <button className={p.mode === 'pattern' ? 'on' : ''} onClick={() => setMode('pattern')}>
          PAT
        </button>
        <button className={p.mode === 'song' ? 'on' : ''} onClick={() => setMode('song')}>
          SONG
        </button>
      </div>

      <div className="row tp-group">
        <button className={`btn icon ${s.playing ? 'on' : ''}`} onClick={() => (s.playing ? pause() : void play())} data-hint="Play / pause (Space)">
          {s.playing ? <Pause /> : <Play />}
        </button>
        <button
          className="btn icon"
          onClick={() => {
            if (!s.playing && !s.recording) seek(0);
            else stop();
          }}
          data-hint="Stop (press again to go back to the start)"
        >
          <Square />
        </button>
        <button className={`btn icon rec ${s.recording ? 'on' : ''}`} onClick={() => (s.recording ? stop() : void record())} data-hint="Record: plays a count-in, then records the armed channels (or the selected one)">
          <Circle fill="currentColor" />
        </button>
      </div>

      <div className="lcd">
        <div className="lcd-cell" data-hint="Tempo in beats per minute — type, or use ↑ ↓">
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
        <div className="lcd-cell lcd-big" data-hint="Song position: bar : beat : tick">
          <span className="lcd-label">{p.mode === 'pattern' ? 'Pattern' : 'Song'}</span>
          <span className="mono lcd-value" ref={posRef}>
            1:01:00
          </span>
        </div>
      </div>

      <div className="fl-pattern" data-hint="Current pattern — the Channel rack edits it, Draw places it on the playlist">
        <button className="btn sm icon ghost" onClick={() => goPattern(-1)} aria-label="Previous pattern">
          <ChevronLeft />
        </button>
        <i style={{ background: pat.color }} />
        <select className="select" value={pat.id} onChange={(e) => setP((pr) => ({ ...pr, currentPatternId: e.target.value }), false)} aria-label="Pattern">
          {p.patterns.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <button className="btn sm icon ghost" onClick={() => goPattern(1)} aria-label="Next pattern">
          <ChevronRight />
        </button>
        <button className="btn sm icon" onClick={() => setP((pr) => newPattern(pr)[0])} data-hint="New pattern">
          <Plus />
        </button>
      </div>

      <div className="fl-views">
        <button className={`fl-view ${s.browserOpen ? 'on' : ''}`} onClick={() => s.setUi({ browserOpen: !s.browserOpen })} data-hint="Browser (F8): templates, beats, chords, instruments" aria-label="Browser">
          <FolderTree />
        </button>
        {viewBtn('rack', <Grid3x3 />, 'Channel rack', 'Channel rack (F6): step sequencer for every channel')}
        {viewBtn('roll', <Music2 />, 'Piano roll', 'Piano roll (F7): draw notes for the selected channel')}
        {viewBtn('mixer', <SlidersHorizontal />, 'Mixer', 'Mixer (F9): volume, pan, EQ and effects')}
        {viewBtn('instrument', <Piano />, 'Play', 'Play the selected channel with the mouse or keyboard')}
      </div>

      <div className="row tp-group">
        <button className={`btn icon ${p.metronome ? 'on' : ''}`} onClick={() => setP((pr) => ({ ...pr, metronome: !pr.metronome }))} data-hint="Metronome">
          <Timer />
        </button>
        <button className={`btn icon ${p.loop.on ? 'on' : ''}`} onClick={() => setP((pr) => ({ ...pr, loop: { ...pr.loop, on: !pr.loop.on } }))} data-hint="Loop the region set on the playlist ruler (song mode)">
          <Repeat />
        </button>
        <div className="fl-snap" data-hint="Snap: what clips and the cursor lock to on the playlist">
          <Magnet size={14} className="faint" />
          <select className="select" value={s.snap} onChange={(e) => s.setUi({ snap: Number(e.target.value) })} aria-label="Snap">
            {SNAPS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="fl-zoom" data-hint="Playlist zoom">
          <ZoomIn size={14} className="faint" />
          <Range value={s.pxPerBeat} min={8} max={96} step={1} onChange={(v) => s.setUi({ pxPerBeat: v })} className="tp-zoom" ariaLabel="Zoom" />
        </div>
        <button className="btn icon ghost" onClick={s.undo} disabled={!s.past.length} data-hint="Undo (Ctrl+Z)">
          <Undo2 />
        </button>
        <button className="btn icon ghost" onClick={s.redo} disabled={!s.future.length} data-hint="Redo (Ctrl+Shift+Z)">
          <Redo2 />
        </button>
      </div>

      {!mobile && (
        <div className="fl-hint" aria-live="polite">
          <HelpCircle size={13} />
          <span>{hint || 'Point at anything to see what it does'}</span>
        </div>
      )}

      {mobile && (
        <button className="btn icon" onClick={() => setModal('guide')} aria-label="Quick start guide">
          <HelpCircle />
        </button>
      )}
      <SaveStatus onClick={() => setModal('projects')} />
      <input
        className="input tp-name"
        value={p.name}
        onChange={(e) => s.edit((pr) => ({ ...pr, name: e.target.value }), false)}
        aria-label="Project name"
        onKeyDown={(e) => e.stopPropagation()}
        data-hint="Project name (used for saved files and exports)"
      />
      <FullscreenButton />
      <button className="btn primary" onClick={doExport} data-hint="Export the song as WAV or MP3, or every channel as separate stems">
        <Download /> <span className="lbl">Export</span>
      </button>

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
            await importSessionFile(await f.text());
            setModal(null);
          } catch {
            alert('That file is not a Sonare session.');
          }
        }}
      />

      {modal === 'guide' && (
        <Modal title="Quick start" onClose={() => setModal(null)}>
          <ol className="guide">
            {GUIDE.map((g, i) => (
              <li key={g.title}>
                <span className="guide-num mono">{i + 1}</span>
                <div>
                  <b>{g.title}</b>
                  <p className="muted">{g.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="row">
            <span className="faint">Want a head start?</span>
            {TEMPLATE_LIST.slice(1).map((t) => (
              <button
                key={t.id}
                className="btn sm"
                onClick={() => {
                  void startProject(fromTemplate(t.id));
                  setModal(null);
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </Modal>
      )}
      <input
        ref={midiRef}
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            await importMidi(f);
          } catch {
            alert('That MIDI file could not be read.');
          }
        }}
      />
      {modal === 'export' && (
        <Modal title="Export" onClose={() => setModal(null)}>
          <ExportPanel />
        </Modal>
      )}
      {modal === 'projects' && (
        <Modal title="My projects" onClose={() => setModal(null)}>
          <ProjectsPanel onClose={() => setModal(null)} onOpenFile={() => fileRef.current?.click()} />
        </Modal>
      )}
      {modal === 'keys' && (
        <Modal title="Keyboard shortcuts" onClose={() => setModal(null)}>
          <table className="shortcuts">
            <tbody>
              {SHORTCUTS.map(([k, d]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td className="muted">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

export function openGuideOnce() {
  try {
    if (localStorage.getItem('sonare.guideSeen')) return false;
    localStorage.setItem('sonare.guideSeen', '1');
    return true;
  } catch {
    return false;
  }
}

function ExportPanel() {
  const p = useStudio((st) => st.project);
  const [what, setWhat] = useState<'mix' | 'stems'>('mix');
  const [format, setFormat] = useState<ExportFormat>('wav');
  const [busy, setBusy] = useState<{ msg: string; frac: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const beats = p.playlist.reduce((m, it) => Math.max(m, it.start + it.length), 0);
  const seconds = (beats * 60) / p.bpm;
  const mins = `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
  const stems = p.tracks.filter((t) => !t.mute).length;

  const run = async () => {
    stop();
    setError(null);
    const step = (msg: string, frac: number) => setBusy({ msg, frac });
    try {
      if (what === 'mix') await exportMix(p, format, step);
      else await exportStems(p, format, step);
    } catch (err) {
      if (what === 'mix' && format === 'wav') {
        // last resort: record the mix in real time
        step('Fast render failed — recording in real time instead…', 0.1);
        try {
          await bounce((f) => step('Recording in real time…', f));
        } catch {
          setError('Export failed. Try again, or export fewer channels.');
        }
      } else setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="export">
      <div className="export-row">
        <span className="field-label">What</span>
        <Segmented
          value={what}
          onChange={setWhat}
          options={[
            { value: 'mix', label: 'Full mix' },
            { value: 'stems', label: `Stems (${stems} files, zipped)` },
          ]}
        />
      </div>
      <div className="export-row">
        <span className="field-label">Format</span>
        <Segmented<ExportFormat>
          value={format}
          onChange={setFormat}
          options={[
            { value: 'wav', label: 'WAV (lossless)' },
            { value: 'mp3-320', label: 'MP3 320' },
            { value: 'mp3-192', label: 'MP3 192' },
          ]}
        />
      </div>
      <p className="muted export-note">
        {beats > 0 ? `Song length ${mins} plus a short tail for reverb and delay.` : 'The playlist is empty, so the current pattern is exported once.'}{' '}
        Rendering runs faster than real time; stems keep each channel's effects and pass through the master bus.
      </p>
      {busy && (
        <div className="export-progress">
          <div className="export-bar">
            <i style={{ width: `${Math.round(busy.frac * 100)}%` }} />
          </div>
          <span className="faint">{busy.msg}</span>
        </div>
      )}
      {error && <p className="err">{error}</p>}
      <div className="row wrap">
        <button className="btn primary" disabled={!!busy} onClick={() => void run()}>
          <Download /> {busy ? 'Exporting…' : `Export ${what === 'mix' ? 'mix' : 'stems'}`}
        </button>
        <div className="spacer" />
        <button className="btn" disabled={!!busy} onClick={() => exportMidi(p, 'song')} data-hint="Notes of the whole song as a .mid file for other music apps">
          MIDI (song)
        </button>
        <button className="btn" disabled={!!busy} onClick={() => exportMidi(p, 'pattern')}>
          MIDI (pattern)
        </button>
      </div>
    </div>
  );
}
