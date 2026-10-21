import { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';
import { useStudio, mapTrack } from './store';
import { trackNode, micMeter, openMic, setMonitoring } from './playback';
import { master } from '../audio/engine';
import { Knob, LevelMeter, Toggle } from '../components/ui';
import { useSettings } from '../theme/settings';
import type { Track } from './types';

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

function Strip({ t }: { t: Track }) {
  const s = useStudio();
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
          <Knob size={28} value={t.eq.high} min={-12} max={12} bipolar defaultValue={0} label="Hi" onChange={(v) => up({ eq: { ...t.eq, high: v } })} />
          <Knob size={28} value={t.eq.mid} min={-12} max={12} bipolar defaultValue={0} label="Mid" onChange={(v) => up({ eq: { ...t.eq, mid: v } })} />
          <Knob size={28} value={t.eq.low} min={-12} max={12} bipolar defaultValue={0} label="Lo" onChange={(v) => up({ eq: { ...t.eq, low: v } })} />
        </div>
      </div>
      <div className="mx-section">
        <span className="mx-label">Sends</span>
        <div className="mx-knobs">
          <Knob size={28} value={t.reverb} min={0} max={1} defaultValue={0} label="Verb" format={fmtPct} onChange={(v) => up({ reverb: v })} />
          <Knob size={28} value={t.delay} min={0} max={1} defaultValue={0} label="Delay" format={fmtPct} onChange={(v) => up({ delay: v })} />
        </div>
      </div>
      <div className="mx-row">
        <span className="mx-label">Comp</span>
        <Toggle on={t.comp} onChange={(v) => up({ comp: v })} label="Compressor" />
      </div>
      <Knob size={30} value={t.pan} min={-1} max={1} bipolar defaultValue={0} label="Pan" format={fmtPan} onChange={(v) => up({ pan: v })} />
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

  return (
    <div className="mixer">
      <div className="mx-strips">
        {p.tracks.map((t) => (
          <Strip key={t.id} t={t} />
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
    </div>
  );
}
