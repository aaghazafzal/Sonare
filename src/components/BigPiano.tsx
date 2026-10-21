import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CircleDot,
  Footprints,
  Gauge,
  Keyboard as KbIcon,
  LayoutDashboard,
  Loader2,
  Music2,
  Pencil,
  Settings2,
  Tags,
  Timer,
  Usb,
  Waves,
  MoveHorizontal,
  ArrowUpDown,
  Piano,
  Maximize,
  Minimize,
} from 'lucide-react';
import { Keyboard } from './instruments/Keyboard';
import { DrumPads } from './instruments/DrumKit';
import { whitesToSpan } from './instruments/InstrumentStage';
import { InstrumentBrowser, TakeRecorder } from './PlayParts';
import { Knob, Range, Segmented, useFullscreen } from './ui';
import { noteOff, noteOn, setSustain, strike, useLive } from '../audio/live';
import { useLoading } from '../audio/engine';
import {
  drumKeyLabels,
  enableMidi,
  keymapFor,
  mappedRange,
  pianoKeyLabels,
  PIANO_BASE,
  RESERVED_CODES,
  codeLabel,
  setBindCapture,
  useMidi,
} from '../audio/input';
import { toggleMetronome, setMetronome, useMetronome } from '../audio/metronome';
import { useSettings, type KeymapMode, type NoteNaming } from '../theme/settings';
import { DEFAULT_CUSTOM_KEYS } from '../lib/keymaps';
import { CHORD_TYPES, detectChord, isBlack, noteName, solfegeName } from '../lib/notes';
import { displayName, FAMILY_LABELS, getInstrument, groupedInstruments, isKitId } from '../lib/instruments';

type Panel = 'sounds' | 'rec' | 'metro' | 'fx' | null;

const ALL_INSTRUMENTS = groupedInstruments().flatMap((g) => g.items);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function whitesDown(m: number, n: number) {
  let x = m;
  let k = 0;
  while (k < n && x > 21) {
    x--;
    if (!isBlack(x)) k++;
  }
  while (isBlack(x)) x--;
  return Math.max(21, x);
}
function countWhites(a: number, b: number) {
  let n = 0;
  for (let m = a; m <= b; m++) if (!isBlack(m)) n++;
  return n;
}

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ width: 1200, height: 300 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    window.addEventListener('resize', read);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', read);
    };
  }, []);
  return [ref, box] as const;
}

function Tile({
  icon,
  label,
  on,
  active,
  onClick,
  title,
}: {
  icon: ReactNode;
  label: string;
  on?: boolean;
  active?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button className={`bp-tile ${on ? 'on' : ''} ${active ? 'active' : ''}`} onClick={onClick} title={title ?? label} data-tile>
      <span className="bp-tile-icon">{icon}</span>
      <span className="bp-tile-label">{label}</span>
    </button>
  );
}

function Group({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="bp-group">
      <span className="bp-group-label">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

function MiniStepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="bp-stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))} aria-label="Down">
        −
      </button>
      <span className="mono">{value > 0 ? `+${value}` : value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} aria-label="Up">
        +
      </button>
    </div>
  );
}

export function BigPiano({ onPick, goStudio }: { onPick: (id: string) => void; goStudio: () => void }) {
  const live = useLive();
  const settings = useSettings();
  const midi = useMidi();
  const metro = useMetronome();
  const pending = useLoading((s) => s.pending);
  const [panel, setPanel] = useState<Panel>(null);
  const [editing, setEditing] = useState(false);
  const [bindSel, setBindSel] = useState<number | null>(null);
  const [bindMsg, setBindMsg] = useState<string | null>(null);
  const [keysRef, keysBox] = useBox<HTMLDivElement>();
  const topRef = useRef<HTMLDivElement>(null);
  const fs = useFullscreen();
  const kit = isKitId(live.instrumentId);
  const naming = settings.bigLabels;

  // close popovers when clicking elsewhere
  useEffect(() => {
    if (!panel) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.bp-pop') || t.closest('[data-tile]') || t.closest('.bp-scroller')) return;
      setPanel(null);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [panel]);

  /* ---------------------------------------------------------- key range */
  const labels = useMemo(
    () => pianoKeyLabels(live.octave, settings.keymap),
    [live.octave, settings.keymap, settings.customKeys],
  );
  const [mapLo, mapHi] = useMemo(
    () => mappedRange(live.octave, settings.keymap),
    [live.octave, settings.keymap, settings.customKeys],
  );
  const { low, high } = useMemo(() => {
    if (settings.bigVisible === 'max') return { low: 21, high: 108 };
    const fit = clamp(Math.floor(keysBox.width / 50), 14, 52);
    let lo = mapLo;
    while (isBlack(lo)) lo--;
    const mapped = countWhites(lo, mapHi);
    lo = whitesDown(lo, Math.max(0, Math.floor((fit - mapped) / 2)));
    let hi = Math.min(108, whitesToSpan(lo, fit));
    if (hi >= 108) lo = whitesDown(108, fit - 1);
    hi = Math.min(108, whitesToSpan(lo, fit));
    return { low: lo, high: hi };
  }, [settings.bigVisible, keysBox.width, mapLo, mapHi]);

  const nameOf = (m: number, naming: NoteNaming) => (naming === 'solfege' ? solfegeName(m) : noteName(m));

  const renderLabel = (m: number, black: boolean) => (
    <>
      {black && naming !== 'off' && <span className="bk-name">{nameOf(m, naming)}</span>}
      {settings.bigKeycaps && labels.get(m) && <span className={`keycap ${black ? 'on-black' : ''}`}>{labels.get(m)}</span>}
      {!black && naming !== 'off' && <span className="wk-name">{nameOf(m, naming)}</span>}
      {!black && m === 60 && <span className="mid-c" title="Middle C" />}
    </>
  );

  /* ----------------------------------------------------- keybind editor */
  const startEditing = () => {
    if (settings.keymap !== 'custom') {
      settings.update({ keymap: 'custom', customKeys: Object.fromEntries(keymapFor(settings.keymap)) });
    }
    setEditing(true);
    setBindSel(null);
    setBindMsg(null);
    settings.update({ bigKeycaps: true });
  };
  useEffect(() => {
    if (!editing) return;
    setBindCapture((code) => {
      if (code === 'Escape' || code === 'Enter') {
        setEditing(false);
        return;
      }
      const sel = bindSelRef.current;
      if (sel === null) {
        setBindMsg('Pick a piano key first, then press a computer key.');
        return;
      }
      const off = sel - (PIANO_BASE + useLive.getState().octave * 12);
      const keys = { ...useSettings.getState().customKeys };
      if (code === 'Backspace' || code === 'Delete') {
        for (const [c, o] of Object.entries(keys)) if (o === off) delete keys[c];
        useSettings.getState().update({ customKeys: keys });
        setBindMsg(`Cleared ${noteName(sel)}.`);
        return;
      }
      if (RESERVED_CODES.has(code)) {
        setBindMsg(`“${code}” is reserved for sustain, octave and velocity.`);
        return;
      }
      for (const [c, o] of Object.entries(keys)) if (o === off || c === code) delete keys[c];
      keys[code] = off;
      useSettings.getState().update({ customKeys: keys });
      setBindMsg(`${codeLabel(code).toUpperCase()} → ${noteName(sel)}`);
      setBindSel(Math.min(108, sel + 1));
    });
    return () => setBindCapture(null);
  }, [editing]);
  const bindSelRef = useRef<number | null>(null);
  bindSelRef.current = bindSel;

  /* -------------------------------------------------- instrument scroller */
  const idx = Math.max(0, ALL_INSTRUMENTS.findIndex((i) => i.id === live.instrumentId));
  const step = (d: number) => onPick(ALL_INSTRUMENTS[(idx + d + ALL_INSTRUMENTS.length) % ALL_INSTRUMENTS.length].id);
  const num = (i: number) => String(((i + ALL_INSTRUMENTS.length) % ALL_INSTRUMENTS.length) + 1).padStart(3, '0');
  const neighbour = (d: number) => ALL_INSTRUMENTS[(idx + d + ALL_INSTRUMENTS.length) % ALL_INSTRUMENTS.length];

  /* ------------------------------------------------------- now playing */
  const held = Object.keys(live.active).map(Number).sort((a, b) => a - b);
  const lastRef = useRef<number[]>([]);
  if (held.length) lastRef.current = held;
  const shown = held.length ? held : lastRef.current;
  const chord = !kit ? detectChord(shown) : null;
  const familyLabel = kit ? FAMILY_LABELS.drums : FAMILY_LABELS[getInstrument(live.instrumentId)?.family ?? ''] ?? '';
  const dl = useMemo(() => drumKeyLabels(), []);

  const keymapHint: Record<KeymapMode, ReactNode> = {
    real: (
      <>
        White keys <kbd>Q</kbd>…<kbd>P</kbd> <kbd>Z</kbd>…<kbd>/</kbd> · black keys on the row above
      </>
    ),
    full: (
      <>
        White keys <kbd>1</kbd>…<kbd>M</kbd> · hold <kbd>Shift</kbd> for the black key
      </>
    ),
    classic: (
      <>
        <kbd>Z</kbd>…<kbd>/</kbd> lower octave · <kbd>Q</kbd>…<kbd>]</kbd> upper octave
      </>
    ),
    custom: <>Your own keys — they're printed on the piano</>,
  };

  return (
    <div className="bp">
      <div className="bp-top" ref={topRef}>
        <div className="bp-brand">
          <span className="eyebrow">{familyLabel}</span>
          <span className="bp-brand-name">Big piano</span>
        </div>

        <div className="bp-vol" title={`Volume ${live.volume.toFixed(0)} dB`}>
          <input
            type="range"
            className="fader bp-fader"
            min={-30}
            max={6}
            step={1}
            value={live.volume}
            onChange={(e) => live.set({ volume: Number(e.target.value) })}
            onDoubleClick={() => live.set({ volume: 0 })}
            aria-label="Volume"
          />
        </div>

        <div
          className="bp-scroller"
          onWheel={(e) => step(e.deltaY > 0 ? 1 : -1)}
          title="Scroll or use the arrows to change sound"
        >
          <div className="bp-scroller-list">
            <button className="bp-scroller-row dim" onClick={() => step(-1)}>
              <span className="mono">{num(idx - 1)}</span>
              {neighbour(-1).name}
            </button>
            <button className="bp-scroller-row cur" onClick={() => setPanel(panel === 'sounds' ? null : 'sounds')}>
              <span className="mono">{num(idx)}</span>
              <span className="bp-scroller-name">{displayName(live.instrumentId)}</span>
              {pending[live.instrumentId] && <Loader2 size={12} className="spin" />}
            </button>
            <button className="bp-scroller-row dim" onClick={() => step(1)}>
              <span className="mono">{num(idx + 1)}</span>
              {neighbour(1).name}
            </button>
          </div>
          <div className="bp-scroller-arrows">
            <button onClick={() => step(-1)} aria-label="Previous sound">
              <ChevronUp size={15} />
            </button>
            <button onClick={() => step(1)} aria-label="Next sound">
              <ChevronDown size={15} />
            </button>
          </div>
        </div>

        <div className="bp-tiles">
          <Tile icon={<Music2 />} label="Sounds" on={panel === 'sounds'} onClick={() => setPanel(panel === 'sounds' ? null : 'sounds')} />
          {!kit && (
            <Tile icon={<Footprints />} label="Sustain" active={live.sustain} onClick={() => setSustain(!live.sustain)} title="Sustain pedal (hold Space)" />
          )}
          <Tile icon={<Settings2 />} label="Settings" on={settings.bigToolbar} onClick={() => settings.update({ bigToolbar: !settings.bigToolbar })} />
          <Tile icon={<CircleDot />} label="Recorder" on={panel === 'rec'} onClick={() => setPanel(panel === 'rec' ? null : 'rec')} />
          <Tile icon={<Timer />} label="Metronome" on={panel === 'metro'} active={metro.on} onClick={() => setPanel(panel === 'metro' ? null : 'metro')} />
          <Tile icon={<Waves />} label="Effects" on={panel === 'fx'} onClick={() => setPanel(panel === 'fx' ? null : 'fx')} />
          <div className="divider-v" />
          {fs.supported && (
            <Tile icon={fs.on ? <Minimize /> : <Maximize />} label={fs.on ? 'Exit full' : 'Full screen'} active={fs.on} onClick={fs.toggle} />
          )}
          <Tile icon={<LayoutDashboard />} label="Workspace" onClick={() => settings.update({ playLayout: 'workspace' })} title="Switch to the full workspace layout" />
        </div>

        {panel === 'sounds' && (
          <div className="bp-pop bp-pop-sounds">
            <InstrumentBrowser
              inSheet
              value={live.instrumentId}
              onPick={(id) => {
                onPick(id);
                setPanel(null);
              }}
            />
          </div>
        )}
        {panel === 'rec' && (
          <div className="bp-pop bp-pop-right">
            <h4>Recorder</h4>
            <p className="muted">Record what you play, listen back, then send it to the studio as a new track.</p>
            <TakeRecorder onSent={goStudio} />
          </div>
        )}
        {panel === 'metro' && (
          <div className="bp-pop bp-pop-right">
            <h4>Metronome</h4>
            <div className="bp-metro">
              <div className="bp-metro-dots">
                {Array.from({ length: metro.beats }).map((_, i) => (
                  <i key={i} className={`${metro.on && metro.beat === i ? 'on' : ''} ${i === 0 ? 'first' : ''}`} />
                ))}
              </div>
              <div className="row">
                <span className="field-label">Tempo</span>
                <MiniStepper value={metro.bpm} min={30} max={240} onChange={(v) => setMetronome({ bpm: v })} />
                <span className="faint mono">BPM</span>
              </div>
              <Range value={metro.bpm} min={30} max={240} step={1} onChange={(v) => setMetronome({ bpm: Math.round(v) })} ariaLabel="Tempo" />
              <div className="row">
                <span className="field-label">Beats</span>
                <Segmented
                  value={metro.beats}
                  onChange={(v) => setMetronome({ beats: v })}
                  options={[2, 3, 4, 6].map((b) => ({ value: b, label: `${b}/4` }))}
                />
              </div>
              <button className={`btn ${metro.on ? 'on' : 'primary'}`} onClick={() => void toggleMetronome()}>
                <Timer /> {metro.on ? 'Stop' : 'Start'}
              </button>
            </div>
          </div>
        )}
        {panel === 'fx' && (
          <div className="bp-pop bp-pop-right">
            <h4>Effects</h4>
            <div className="bp-fx">
              <Knob size={44} value={live.reverb} min={0} max={1} defaultValue={0.18} label="Reverb" format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => live.set({ reverb: v })} />
              <Knob size={44} value={live.volume} min={-30} max={6} defaultValue={0} label="Volume" format={(v) => `${v.toFixed(0)} dB`} onChange={(v) => live.set({ volume: v })} />
            </div>
            {!kit && (
              <label className="field">
                <span className="field-label">Chord mode — one key plays a whole chord</span>
                <select className="select" value={live.chord} onChange={(e) => live.set({ chord: e.target.value })}>
                  {Object.entries(CHORD_TYPES).map(([k, c]) => (
                    <option key={k} value={k}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      {settings.bigToolbar && (
        <div className="bp-settings">
          {!kit && (
            <Group icon={<KbIcon />} label="PC keybinds">
              <div className="bp-seg-row">
                <Segmented<KeymapMode>
                  value={settings.keymap}
                  onChange={(v) => {
                    setEditing(false);
                    settings.update({ keymap: v });
                  }}
                  options={[
                    { value: 'real', label: 'Real', title: 'Piano-shaped: Q–P and Z–/ are white keys' },
                    { value: 'full', label: 'Full', title: 'Five octaves, Shift for black keys' },
                    { value: 'classic', label: 'Classic', title: 'Two rows: Z–/ and Q–]' },
                    { value: 'custom', label: 'Custom', title: 'Your own keys' },
                  ]}
                />
                <button className={`btn icon ${editing ? 'on' : ''}`} onClick={() => (editing ? setEditing(false) : startEditing())} title="Edit custom keys">
                  <Pencil />
                </button>
              </div>
            </Group>
          )}
          {!kit && (
            <Group icon={<ArrowUpDown />} label="Octave shift">
              <MiniStepper value={live.octave} min={-3} max={3} onChange={(v) => live.set({ octave: v })} />
            </Group>
          )}
          {!kit && (
            <Group icon={<MoveHorizontal />} label="Transpose">
              <MiniStepper value={live.transpose} min={-12} max={12} onChange={(v) => live.set({ transpose: v })} />
            </Group>
          )}
          {!kit && (
            <Group icon={<Piano />} label="Visible keys">
              <Segmented
                value={settings.bigVisible}
                onChange={(v) => settings.update({ bigVisible: v })}
                options={[
                  { value: 'focus', label: 'Focus', title: 'Keys around your computer keyboard, bigger' },
                  { value: 'max', label: 'Max', title: 'All 88 keys' },
                ]}
              />
            </Group>
          )}
          {!kit && (
            <Group icon={<Tags />} label="Note labels">
              <Segmented<NoteNaming>
                value={settings.bigLabels}
                onChange={(v) => settings.update({ bigLabels: v })}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'cde', label: 'CDE' },
                  { value: 'solfege', label: 'Do Re Mi' },
                ]}
              />
            </Group>
          )}
          <Group icon={<KbIcon />} label="Key hints">
            <Segmented
              value={settings.bigKeycaps ? 'on' : 'off'}
              onChange={(v) => settings.update({ bigKeycaps: v === 'on' })}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'on', label: 'On' },
              ]}
            />
          </Group>
          <Group icon={<Gauge />} label={`Velocity ${Math.round(live.velocity * 127)}`}>
            <div className="bp-vel">
              <Range value={live.velocity} min={0.1} max={1} onChange={(v) => live.set({ velocity: v })} ariaLabel="Velocity" />
            </div>
          </Group>
          <Group icon={<Usb />} label="MIDI">
            {midi.supported ? (
              <Segmented
                value={midi.enabled ? 'on' : 'off'}
                onChange={(v) => v === 'on' && void enableMidi()}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'on', label: midi.enabled ? (midi.devices[0] ?? 'On') : 'Connect' },
                ]}
              />
            ) : (
              <span className="faint bp-small">Not in this browser</span>
            )}
          </Group>
        </div>
      )}

      {editing && (
        <div className="bp-bindbar">
          <Pencil size={14} />
          <span>
            {bindSel === null ? (
              <>Click a piano key, then press the computer key you want for it.</>
            ) : (
              <>
                Press a key for <b>{noteName(bindSel)}</b> · <kbd>Backspace</kbd> clears it · <kbd>Esc</kbd> finishes
              </>
            )}
          </span>
          {bindMsg && <span className="bp-bindmsg mono">{bindMsg}</span>}
          <div className="spacer" />
          <button className="btn sm" onClick={() => settings.update({ customKeys: DEFAULT_CUSTOM_KEYS })}>
            Reset to Real
          </button>
          <button className="btn sm primary" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      )}

      <div className="bp-stage">
        <div className={`bp-now ${held.length ? 'live' : ''}`}>
          {shown.length ? (
            <>
              <div className="bp-now-main">{kit ? shown.map((m) => dl.get(m) ?? m).join(' ') : chord ?? (shown.length === 1 ? nameOf(shown[0], naming === 'solfege' ? 'solfege' : 'cde') : '')}</div>
              {!kit && (
                <div className="bp-now-notes">
                  {shown.map((m) => (
                    <span key={m} className="tag mono">
                      {nameOf(m, naming === 'solfege' ? 'solfege' : 'cde')}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="bp-idle">
              <div className="bp-idle-title">{displayName(live.instrumentId)}</div>
              <div className="bp-idle-line">{kit ? 'Tap the pads or use the keys shown on them' : keymapHint[settings.keymap]}</div>
              <div className="bp-idle-line faint">
                {!kit && (
                  <>
                    Hold <kbd>Space</kbd> to sustain · <kbd>←</kbd> <kbd>→</kbd> octave ·{' '}
                  </>
                )}
                <kbd>↑</kbd> <kbd>↓</kbd> velocity
              </div>
            </div>
          )}
          <div className="bp-status mono">
            {!kit && <span>Oct {live.octave > 0 ? `+${live.octave}` : live.octave}</span>}
            {!kit && live.transpose !== 0 && <span>Trn {live.transpose > 0 ? `+${live.transpose}` : live.transpose}</span>}
            <span>Vel {Math.round(live.velocity * 127)}</span>
            {!kit && <span className={live.sustain ? 'hot' : ''}>Sus {live.sustain ? 'on' : 'off'}</span>}
            {metro.on && <span className="hot">♩ {metro.bpm}</span>}
          </div>
        </div>
      </div>

      <div className={`bp-keys ${kit ? 'is-kit' : ''}`} ref={keysRef}>
        {kit ? (
          <DrumPads skin={settings.skins.drums} active={live.active} onDown={(m) => noteOn(m)} onUp={(m) => noteOff(m)} keyLabels={dl} />
        ) : (
          <Keyboard
            low={low}
            high={high}
            active={live.active}
            onDown={(m, v) => {
              if (editing) {
                setBindSel(m);
                setBindMsg(null);
                strike(m, v, 300);
              } else noteOn(m, v);
            }}
            onUp={(m) => !editing && noteOff(m)}
            skin={settings.skins.keyboard}
            showCase={false}
            className="kb-flat"
            height={Math.max(180, keysBox.height)}
            renderLabel={renderLabel}
            marked={bindSel !== null && editing ? { [bindSel]: true } : undefined}
          />
        )}
      </div>
    </div>
  );
}
