import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Mic, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useStudio, mapTrack, uid } from './store';
import { trackNode, micMeter, openMic, setMonitoring } from './playback';
import { master } from '../audio/engine';
import { Knob, LevelMeter, Toggle } from '../components/ui';
import { useSettings } from '../theme/settings';
import type { Track } from './types';
import { FX_DEFS, FX_TYPES, defaultSlot, formatParam, type FxSlot, type FxType } from '../audio/fx';

const fmtDb = (v: number) => (v <= -40 ? '-∞' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`);
const fmtPan = (v: number) => (Math.abs(v) < 0.02 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`);
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

function Fader({ value, onChange, onStart }: { value: number; onChange: (v: number) => void; onStart: () => void }) {
  return (
    <input
      type="range"
      className="fader"
      min={-40}
      max={6}
      step={0.5}
      value={value}
      onPointerDown={onStart}
      onDoubleClick={() => onChange(0)}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Volume fader"
    />
  );
}

function Strip({ t, onFx, fxOpen }: { t: Track; onFx: () => void; fxOpen: boolean }) {
  const s = useStudio();
  const cp = () => s.checkpoint();
  const up = (patch: Partial<Track>) => s.edit((p) => mapTrack(p, t.id, (tr) => ({ ...tr, ...patch })), false);
  const node = trackNode(t.id);
  // node is created asynchronously after a track is added
  const [, force] = useState(0);
  useEffect(() => {
    if (!node) {
      const id = setTimeout(() => force((n) => n + 1), 60);
      return () => clearTimeout(id);
    }
  }, [node]);

  return (
    <div
      className={`mx-strip ${s.selectedTrackId === t.id ? 'sel' : ''}`}
      style={{ ['--clip' as string]: t.color }}
      onPointerDown={() => s.setUi({ selectedTrackId: t.id })}
    >
      <div className="mx-name" title={t.name}>
        {t.name}
      </div>
      <div className="mx-section">
        <span className="mx-label">EQ</span>
        <div className="mx-knobs">
          <Knob size={28} value={t.eq.high} min={-12} max={12} bipolar defaultValue={0} onStart={cp} label="Hi" onChange={(v) => up({ eq: { ...t.eq, high: v } })} />
          <Knob size={28} value={t.eq.mid} min={-12} max={12} bipolar defaultValue={0} onStart={cp} label="Mid" onChange={(v) => up({ eq: { ...t.eq, mid: v } })} />
          <Knob size={28} value={t.eq.low} min={-12} max={12} bipolar defaultValue={0} onStart={cp} label="Lo" onChange={(v) => up({ eq: { ...t.eq, low: v } })} />
        </div>
      </div>
      <div className="mx-section">
        <span className="mx-label">Sends</span>
        <div className="mx-knobs">
          <Knob size={28} value={t.reverb} min={0} max={1} defaultValue={0} onStart={cp} label="Verb" format={fmtPct} onChange={(v) => up({ reverb: v })} />
          <Knob size={28} value={t.delay} min={0} max={1} defaultValue={0} onStart={cp} label="Delay" format={fmtPct} onChange={(v) => up({ delay: v })} />
        </div>
      </div>
      <div className="mx-row">
        <span className="mx-label">Comp</span>
        <Toggle on={t.comp} onChange={(v) => s.edit((p) => mapTrack(p, t.id, (tr) => ({ ...tr, comp: v })))} label="Compressor" />
      </div>
      <div className="mx-section">
        <span className="mx-label">Effects</span>
        <button className={`mx-fx ${fxOpen ? 'on' : ''}`} onClick={onFx} data-hint="Insert effects on this channel: filter, distortion, chorus, delay…">
          {(t.fx ?? []).length ? (
            (t.fx ?? []).slice(0, 3).map((f) => (
              <span key={f.id} className={f.on ? '' : 'off'}>
                {FX_DEFS[f.type].label}
              </span>
            ))
          ) : (
            <span className="faint">
              <Plus size={11} /> Add
            </span>
          )}
          {(t.fx ?? []).length > 3 && <span className="faint">+{(t.fx ?? []).length - 3} more</span>}
        </button>
      </div>
      <Knob size={30} value={t.pan} min={-1} max={1} bipolar defaultValue={0} onStart={cp} label="Pan" format={fmtPan} onChange={(v) => up({ pan: v })} />
      <div className="mx-fader">
        <Fader value={t.volume} onChange={(v) => up({ volume: v })} onStart={() => s.checkpoint()} />
        {node && <LevelMeter meter={node.strip.meter} className="mx-meter" />}
      </div>
      <span className="mono mx-db">{fmtDb(t.volume)}</span>
      <div className="mx-buttons">
        <button className={`btn sm icon ${t.mute ? 'on' : ''}`} onClick={() => up({ mute: !t.mute })}>
          M
        </button>
        <button className={`btn sm icon solo ${t.solo ? 'on' : ''}`} onClick={() => up({ solo: !t.solo })}>
          S
        </button>
        <button className={`btn sm icon rec ${t.arm ? 'on' : ''}`} onClick={() => up({ arm: !t.arm })}>
          R
        </button>
      </div>
      <i className="mx-color" />
    </div>
  );
}

export function Mixer() {
  const s = useStudio();
  const p = s.project;
  const settings = useSettings();
  const [micOn, setMicOn] = useState(false);
  const [micErr, setMicErr] = useState<string | null>(null);
  const [reverbDecay, setReverbDecay] = useState(() => Number(master.reverb.decay));
  const [delayFb, setDelayFb] = useState(() => master.delay.feedback.value);
  const [fxFor, setFxFor] = useState<string | null>(null);
  const fxTrack = p.tracks.find((t) => t.id === fxFor);

  return (
    <div className="mixer">
      <div className="mx-strips">
        {p.tracks.map((t) => (
          <Strip key={t.id} t={t} fxOpen={fxFor === t.id} onFx={() => setFxFor(fxFor === t.id ? null : t.id)} />
        ))}
      </div>
      <div className="mx-master">
        <div className="mx-name">Master</div>
        <div className="mx-section">
          <span className="mx-label">Reverb bus</span>
          <div className="mx-knobs">
            <Knob
              size={28}
              value={reverbDecay}
              min={0.4}
              max={8}
              label="Decay"
              format={(v) => `${v.toFixed(1)}s`}
              onChange={(v) => {
                setReverbDecay(v);
                master.reverb.decay = v;
              }}
            />
          </div>
        </div>
        <div className="mx-section">
          <span className="mx-label">Delay bus</span>
          <div className="mx-knobs">
            <Knob
              size={28}
              value={delayFb}
              min={0}
              max={0.85}
              label="Fdbk"
              format={fmtPct}
              onChange={(v) => {
                setDelayFb(v);
                master.delay.feedback.value = v;
              }}
            />
          </div>
        </div>
        <div className="mx-fader">
          <Fader value={p.master} onChange={(v) => s.edit((pr) => ({ ...pr, master: v }), false)} onStart={() => s.checkpoint()} />
          <LevelMeter meter={master.meter} className="mx-meter" />
        </div>
        <span className="mono mx-db">{fmtDb(p.master)}</span>
      </div>
      <div className="mx-input">
        <div className="mx-name">
          <Mic size={13} /> Input
        </div>
        {!micOn ? (
          <button
            className="btn sm"
            onClick={async () => {
              try {
                const m = await openMic();
                m.connect(micMeter);
                setMicOn(true);
                setMicErr(null);
              } catch {
                setMicErr('Microphone permission was denied.');
              }
            }}
          >
            Enable mic
          </button>
        ) : (
          <>
            <div className="mx-fader">
              <LevelMeter meter={micMeter} className="mx-meter wide" />
            </div>
            <div className="mx-row">
              <span className="mx-label">Monitor</span>
              <Toggle
                on={settings.inputMonitoring}
                onChange={(v) => {
                  settings.update({ inputMonitoring: v });
                  setMonitoring(v);
                }}
                label="Input monitoring"
              />
            </div>
            <span className="faint mx-note">Use headphones when monitoring.</span>
          </>
        )}
        {micErr && <span className="mx-note err">{micErr}</span>}
      </div>
      {fxTrack && <FxRack track={fxTrack} onClose={() => setFxFor(null)} />}
    </div>
  );
}

/** The selected channel's insert effects, in signal order. */
function FxRack({ track, onClose }: { track: Track; onClose: () => void }) {
  const s = useStudio();
  const slots = track.fx ?? [];
  const setFx = (fn: (fx: FxSlot[]) => FxSlot[], record = true) =>
    s.edit((p) => mapTrack(p, track.id, (t) => ({ ...t, fx: fn(t.fx ?? []) })), record);
  const patch = (id: string, change: (f: FxSlot) => FxSlot, record = false) => setFx((fx) => fx.map((f) => (f.id === id ? change(f) : f)), record);
  const move = (i: number, d: number) =>
    setFx((fx) => {
      const next = [...fx];
      const j = i + d;
      if (j < 0 || j >= next.length) return fx;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <div className="fx-rack" style={{ ['--clip' as string]: track.color }}>
      <div className="fx-head">
        <Sparkles size={14} />
        <b>Effects</b>
        <span className="faint">{track.name}</span>
        <div className="spacer" />
        <button className="btn sm icon ghost" onClick={onClose} aria-label="Close effects">
          <X />
        </button>
      </div>
      <select
        className="select"
        value=""
        onChange={(e) => {
          const type = e.target.value as FxType;
          if (type) setFx((fx) => [...fx, defaultSlot(type, uid())]);
        }}
        aria-label="Add effect"
        data-hint="Effects run top to bottom, before the fader"
      >
        <option value="">+ Add effect…</option>
        {FX_TYPES.map((t) => (
          <option key={t} value={t}>
            {FX_DEFS[t].label} — {FX_DEFS[t].hint}
          </option>
        ))}
      </select>
      <div className="fx-list">
        {!slots.length && <div className="empty faint">No effects yet. Try Filter on a pad, Distortion on a guitar, or Ping-pong delay on a lead.</div>}
        {slots.map((f, i) => {
          const def = FX_DEFS[f.type];
          return (
            <div key={f.id} className={`fx-slot ${f.on ? '' : 'off'}`}>
              <div className="fx-slot-head">
                <button
                  className={`led ${f.on ? 'on' : ''}`}
                  onClick={() => patch(f.id, (x) => ({ ...x, on: !x.on }), true)}
                  aria-label={f.on ? 'Bypass effect' : 'Enable effect'}
                  data-hint="Turn this effect on or off"
                />
                <b>{def.label}</b>
                <div className="spacer" />
                <button className="btn sm icon ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  <ArrowUp />
                </button>
                <button className="btn sm icon ghost" onClick={() => move(i, 1)} disabled={i === slots.length - 1} aria-label="Move down">
                  <ArrowDown />
                </button>
                <button className="btn sm icon ghost danger-ghost" onClick={() => setFx((fx) => fx.filter((x) => x.id !== f.id))} aria-label="Remove effect">
                  <Trash2 />
                </button>
              </div>
              <div className="fx-knobs">
                {def.params.map((pd) =>
                  pd.choices ? (
                    <label key={pd.key} className="fx-choice">
                      <span className="knob-label">{pd.label}</span>
                      <select
                        className="select"
                        value={Math.round(f.params[pd.key] ?? pd.def)}
                        onChange={(e) => patch(f.id, (x) => ({ ...x, params: { ...x.params, [pd.key]: Number(e.target.value) } }), true)}
                      >
                        {pd.choices.map((c, ci) => (
                          <option key={c} value={ci}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <Knob
                      key={pd.key}
                      size={34}
                      label={pd.label}
                      // log params get a log knob
                      value={pd.log ? Math.log((f.params[pd.key] ?? pd.def) / pd.min) / Math.log(pd.max / pd.min) : f.params[pd.key] ?? pd.def}
                      min={pd.log ? 0 : pd.min}
                      max={pd.log ? 1 : pd.max}
                      defaultValue={pd.log ? Math.log(pd.def / pd.min) / Math.log(pd.max / pd.min) : pd.def}
                      onStart={() => s.checkpoint()}
                      format={(v) => formatParam(pd, pd.log ? pd.min * Math.pow(pd.max / pd.min, v) : v)}
                      onChange={(v) => {
                        let real = pd.log ? pd.min * Math.pow(pd.max / pd.min, v) : v;
                        if (pd.step) real = Math.round(real / pd.step) * pd.step;
                        patch(f.id, (x) => ({ ...x, params: { ...x.params, [pd.key]: real } }));
                      }}
                    />
                  ),
                )}
                {def.mix && (
                  <Knob
                    size={34}
                    label="Mix"
                    value={f.mix}
                    min={0}
                    max={1}
                    defaultValue={1}
                    onStart={() => s.checkpoint()}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => patch(f.id, (x) => ({ ...x, mix: v }))}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
