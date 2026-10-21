import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Circle, Keyboard as KbIcon, Loader2, Minus, Plus, Search, Send, SlidersHorizontal, Square, Usb, Play as PlayIcon } from 'lucide-react';
import { InstrumentStage } from '../components/instruments/InstrumentStage';
import { useLive, onLiveNote, setSustain, liveStrip } from '../audio/live';
import { useLoading, ensureAudio } from '../audio/engine';
import { enableMidi, useMidi } from '../audio/input';
import { groupedInstruments, getInstrument, getKit, isKitId, displayName, defaultView, FAMILY_LABELS } from '../lib/instruments';
import { Knob, LevelMeter, Range, Sheet } from '../components/ui';
import { useMobile } from '../lib/useMobile';
import { useStudio, makeTrack, uid } from '../studio/store';
import type { MidiClip, Note } from '../studio/types';
import { liveVoice } from '../audio/live';
import * as Tone from 'tone';

const RECENT_KEY = 'sonare.recent';

function InstrumentBrowser({ value, onPick, inSheet = false }: { value: string; onPick: (id: string) => void; inSheet?: boolean }) {
  const [q, setQ] = useState('');
  const pending = useLoading((s) => s.pending);
  const groups = useMemo(() => groupedInstruments(), []);
  const filtered = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())) }))
    .filter((g) => g.items.length);
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: inSheet ? 'center' : 'nearest' });
  }, []);

  return (
    <aside className={`browser ${inSheet ? 'in-sheet' : ''}`}>
      <div className="browser-search">
        <Search size={14} />
        <input
          className="input"
          placeholder="Search 112 instruments"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label="Search instruments"
        />
      </div>
      <div className="browser-list">
        {filtered.map((g) => (
          <section key={g.family}>
            <h4 className="eyebrow">{g.label}</h4>
            {g.items.map((i) => (
              <button
                key={i.id}
                ref={i.id === value ? activeRef : undefined}
                className={`browser-item ${i.id === value ? 'on' : ''}`}
                onClick={() => onPick(i.id)}
              >
                <span>{i.name}</span>
                {pending[i.id] ? <Loader2 size={13} className="spin faint" /> : null}
              </button>
            ))}
          </section>
        ))}
        {!filtered.length && <div className="empty">No instrument matches “{q}”.</div>}
      </div>
    </aside>
  );
}

function Stepper({ label, value, min, max, onChange, format }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div className="stepper">
      <span className="field-label">{label}</span>
      <div className="stepper-box">
        <button className="btn sm icon ghost" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`${label} down`}>
          <Minus />
        </button>
        <span className="mono">{format ? format(value) : value}</span>
        <button className="btn sm icon ghost" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`${label} up`}>
          <Plus />
        </button>
      </div>
    </div>
  );
}

/** Quick take recorder: capture what you play here and drop it into the studio as a new track. */
function TakeRecorder({ onSent }: { onSent: () => void }) {
  const instrumentId = useLive((s) => s.instrumentId);
  const [rec, setRec] = useState(false);
  const [notes, setNotes] = useState<{ pitch: number; t: number; dur: number; vel: number }[]>([]);
  const t0 = useRef(0);
  const pending = useRef(new Map<number, { t: number; vel: number }>());
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!rec) return;
    return onLiveNote((e) => {
      const t = performance.now() / 1000 - t0.current;
      if (e.type === 'on') pending.current.set(e.midi, { t, vel: e.vel });
      else {
        const p = pending.current.get(e.midi);
        if (!p) return;
        pending.current.delete(e.midi);
        setNotes((ns) => [...ns, { pitch: e.midi, t: p.t, dur: Math.max(0.05, t - p.t), vel: p.vel }]);
      }
    });
  }, [rec]);

  const start = () => {
    setNotes([]);
    pending.current.clear();
    t0.current = performance.now() / 1000;
    setRec(true);
  };
  const stopRec = () => setRec(false);

  const playBack = async () => {
    await ensureAudio();
    if (!notes.length) return;
    const first = notes[0].t;
    const now = Tone.now() + 0.05;
    notes.forEach((n) => liveVoice.play(n.pitch, n.dur, now + n.t - first, n.vel));
    setPlaying(true);
    const len = Math.max(...notes.map((n) => n.t + n.dur)) - first;
    setTimeout(() => setPlaying(false), len * 1000 + 300);
  };

  const send = () => {
    const st = useStudio.getState();
    const bpm = st.project.bpm;
    const first = notes[0]?.t ?? 0;
    const conv: Note[] = notes.map((n) => ({
      id: uid(),
      pitch: n.pitch,
      start: Math.round(((n.t - first) * bpm) / 60 / 0.0625) * 0.0625,
      dur: Math.max(0.0625, (n.dur * bpm) / 60),
      vel: n.vel,
    }));
    const bpb = st.project.beatsPerBar;
    const len = Math.max(bpb, Math.ceil(Math.max(...conv.map((n) => n.start + n.dur)) / bpb) * bpb);
    const kind = isKitId(instrumentId) ? 'drums' : 'instrument';
    const track = makeTrack(kind, instrumentId, st.project.tracks.length, `${displayName(instrumentId)} take`);
    const clip: MidiClip = { id: uid(), kind: 'midi', name: 'Take', start: 0, length: len, notes: conv };
    track.clips = [clip];
    st.edit((p) => ({ ...p, tracks: [...p.tracks, track] }));
    st.setUi({ selectedTrackId: track.id, selectedClipId: clip.id, dock: 'editor', dockOpen: true });
    setNotes([]);
    onSent();
  };

  return (
    <div className="take">
      <span className="field-label">Take</span>
      <div className="row">
        {!rec ? (
          <button className="btn rec" onClick={start} title="Record what you play">
            <Circle fill="currentColor" /> Rec
          </button>
        ) : (
          <button className="btn rec on" onClick={stopRec}>
            <Square /> Stop
          </button>
        )}
        <button className="btn" disabled={!notes.length || rec || playing} onClick={playBack}>
          <PlayIcon /> Play
        </button>
        <button className="btn" disabled={!notes.length || rec} onClick={send} title="Add as a new track in the studio">
          <Send /> To studio
        </button>
        <span className="mono faint take-count">{notes.length ? `${notes.length} notes` : rec ? 'listening…' : ''}</span>
      </div>
    </div>
  );
}

export function PlayPage({ goStudio }: { goStudio: () => void }) {
  const live = useLive();
  const pending = useLoading((s) => s.pending);
  const midi = useMidi();
  const inst = getInstrument(live.instrumentId);
  const loading = !!pending[live.instrumentId];
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
      return ids.filter((id) => getInstrument(id) || getKit(id));
    } catch {
      return [];
    }
  });

  const pick = (id: string) => {
    live.setInstrument(id);
    void ensureAudio();
    const next = [id, ...recent.filter((r) => r !== id)].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const familyLabel = isKitId(live.instrumentId) ? FAMILY_LABELS.drums : FAMILY_LABELS[inst?.family ?? ''] ?? '';
  const mobile = useMobile();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const isKit = isKitId(live.instrumentId);
  const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

  if (mobile)
    return (
      <div className="play play-m">
        <div className="play-main">
          <header className="m-head">
            <button className="m-picker" onClick={() => setPickerOpen(true)} aria-label="Choose instrument">
              <span className="eyebrow">{familyLabel}</span>
              <span className="m-picker-name">
                <span className="m-picker-text">{displayName(live.instrumentId)}</span>
                {loading ? <Loader2 size={15} className="spin faint" /> : <ChevronDown size={16} className="faint" />}
              </span>
            </button>
            {!isKit && (
              <div className="stepper-box m-oct" aria-label="Octave">
                <button className="btn sm icon ghost" onClick={() => live.set({ octave: Math.max(-3, live.octave - 1) })} aria-label="Octave down">
                  <Minus />
                </button>
                <span className="mono">
                  <small>Oct</small>
                  {signed(live.octave)}
                </span>
                <button className="btn sm icon ghost" onClick={() => live.set({ octave: Math.min(3, live.octave + 1) })} aria-label="Octave up">
                  <Plus />
                </button>
              </div>
            )}
            {!isKit && (
              <button className={`btn m-sus ${live.sustain ? 'on' : ''}`} onPointerDown={() => setSustain(!live.sustain)}>
                Sus
              </button>
            )}
            <button className="btn icon" onClick={() => setMoreOpen(true)} aria-label="Sound and recording controls">
              <SlidersHorizontal />
            </button>
          </header>

          <div className="stage-panel panel">
            <InstrumentStage
              instrumentId={live.instrumentId}
              nativeView={defaultView(live.instrumentId)}
              view={live.view}
              onViewChange={(v) => live.set({ view: v })}
            />
          </div>
        </div>

        <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Instruments" tall>
          {recent.filter((r) => r !== live.instrumentId).length > 0 && (
            <div className="m-recent">
              {recent
                .filter((r) => r !== live.instrumentId)
                .slice(0, 6)
                .map((r) => (
                  <button
                    key={r}
                    className="btn sm"
                    onClick={() => {
                      pick(r);
                      setPickerOpen(false);
                    }}
                  >
                    {displayName(r)}
                  </button>
                ))}
            </div>
          )}
          <InstrumentBrowser
            inSheet
            value={live.instrumentId}
            onPick={(id) => {
              pick(id);
              setPickerOpen(false);
            }}
          />
        </Sheet>

        <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Sound & recording">
          <div className="m-controls">
            {!isKit && (
              <Stepper label="Transpose" value={live.transpose} min={-12} max={12} onChange={(v) => live.set({ transpose: v })} format={signed} />
            )}
            <div className="ctl-vel">
              <span className="field-label">
                Velocity <span className="mono faint">{Math.round(live.velocity * 127)}</span>
              </span>
              <Range value={live.velocity} min={0.1} max={1} onChange={(v) => live.set({ velocity: v })} ariaLabel="Velocity" />
            </div>
            <div className="m-knobs">
              <Knob size={44} value={live.volume} min={-30} max={6} defaultValue={0} label="Volume" format={(v) => `${v.toFixed(0)} dB`} onChange={(v) => live.set({ volume: v })} />
              <Knob size={44} value={live.reverb} min={0} max={1} defaultValue={0.18} label="Reverb" format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => live.set({ reverb: v })} />
              <LevelMeter meter={liveStrip.meter} className="ctl-meter" />
            </div>
            <TakeRecorder
              onSent={() => {
                setMoreOpen(false);
                goStudio();
              }}
            />
            {midi.supported && !midi.enabled && (
              <button className="btn" onClick={() => void enableMidi()}>
                <Usb /> Connect MIDI keyboard
              </button>
            )}
            {midi.enabled && (
              <span className="row faint">
                <Usb size={14} /> {midi.devices.length ? midi.devices.join(', ') : 'MIDI on — no device connected'}
              </span>
            )}
          </div>
        </Sheet>
      </div>
    );

  return (
    <div className="play">
      <InstrumentBrowser value={live.instrumentId} onPick={pick} />
      <div className="play-main">
        <header className="play-head">
          <div className="play-title">
            <span className="eyebrow">{familyLabel}</span>
            <h1>
              {displayName(live.instrumentId)}
              {loading && <Loader2 size={18} className="spin faint" style={{ marginLeft: 10, verticalAlign: -2 }} />}
            </h1>
          </div>
          <div className="recent">
            {recent
              .filter((r) => r !== live.instrumentId)
              .slice(0, 5)
              .map((r) => (
                <button key={r} className="btn sm ghost" onClick={() => pick(r)}>
                  {displayName(r)}
                </button>
              ))}
          </div>
        </header>

        <div className="controls panel">
          {!isKitId(live.instrumentId) && (
            <>
              <Stepper label="Octave" value={live.octave} min={-3} max={3} onChange={(v) => live.set({ octave: v })} format={(v) => (v > 0 ? `+${v}` : String(v))} />
              <Stepper label="Transpose" value={live.transpose} min={-12} max={12} onChange={(v) => live.set({ transpose: v })} format={(v) => (v > 0 ? `+${v}` : String(v))} />
            </>
          )}
          <div className="ctl-vel">
            <span className="field-label">
              Velocity <span className="mono faint">{Math.round(live.velocity * 127)}</span>
            </span>
            <Range value={live.velocity} min={0.1} max={1} onChange={(v) => live.set({ velocity: v })} ariaLabel="Velocity" />
          </div>
          {!isKitId(live.instrumentId) && (
            <div className="ctl-sustain">
              <span className="field-label">Sustain</span>
              <button
                className={`btn ${live.sustain ? 'on' : ''}`}
                onPointerDown={() => setSustain(!live.sustain)}
                title="Hold Space for sustain"
              >
                {live.sustain ? 'On' : 'Off'} <kbd>Space</kbd>
              </button>
            </div>
          )}
          <div className="divider-v" />
          <Knob value={live.volume} min={-30} max={6} defaultValue={0} label="Volume" format={(v) => `${v.toFixed(0)} dB`} onChange={(v) => live.set({ volume: v })} />
          <Knob value={live.reverb} min={0} max={1} defaultValue={0.18} label="Reverb" format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => live.set({ reverb: v })} />
          <LevelMeter meter={liveStrip.meter} className="ctl-meter" />
          <div className="divider-v" />
          <TakeRecorder onSent={goStudio} />
        </div>

        <div className="stage-panel panel">
          <InstrumentStage
            instrumentId={live.instrumentId}
            nativeView={defaultView(live.instrumentId)}
            view={live.view}
            onViewChange={(v) => live.set({ view: v })}
          />
        </div>

        <footer className="play-foot">
          <span className="row">
            <KbIcon size={14} />
            {isKitId(live.instrumentId) ? (
              <span>
                Drum keys shown on the kit. <kbd>↑</kbd>
                <kbd>↓</kbd> velocity
              </span>
            ) : (
              <span>
                <kbd>Z</kbd>–<kbd>/</kbd> lower octave, <kbd>Q</kbd>–<kbd>]</kbd> upper octave · <kbd>←</kbd>
                <kbd>→</kbd> octave · <kbd>↑</kbd>
                <kbd>↓</kbd> velocity · hold <kbd>Space</kbd> to sustain
              </span>
            )}
          </span>
          <div className="spacer" />
          {midi.supported ? (
            midi.enabled ? (
              <span className="row faint">
                <Usb size={14} /> {midi.devices.length ? midi.devices.join(', ') : 'MIDI on — no device connected'}
              </span>
            ) : (
              <button className="btn sm" onClick={() => void enableMidi()}>
                <Usb /> Connect MIDI keyboard
              </button>
            )
          ) : (
            <span className="faint">Web MIDI isn’t available in this browser</span>
          )}
          {midi.error && <span className="err">{midi.error}</span>}
        </footer>
      </div>
    </div>
  );
}
