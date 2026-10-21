import { useState } from 'react';
import { ChevronDown, Keyboard as KbIcon, Loader2, Maximize2, Minus, Plus, SlidersHorizontal, Usb } from 'lucide-react';
import { InstrumentStage } from '../components/instruments/InstrumentStage';
import { InstrumentBrowser, Stepper, TakeRecorder } from '../components/PlayParts';
import { BigPiano } from '../components/BigPiano';
import { useLive, setSustain, liveStrip } from '../audio/live';
import { useLoading, ensureAudio } from '../audio/engine';
import { enableMidi, useMidi } from '../audio/input';
import { getInstrument, getKit, isKitId, displayName, defaultView, FAMILY_LABELS } from '../lib/instruments';
import { Knob, LevelMeter, Range, Sheet } from '../components/ui';
import { useMobile } from '../lib/useMobile';
import { useSettings } from '../theme/settings';

const RECENT_KEY = 'sonare.recent';

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
  const playLayout = useSettings((s) => s.playLayout);
  const keymap = useSettings((s) => s.keymap);
  const setSettings = useSettings((s) => s.update);
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

  if (playLayout === 'big') return <BigPiano onPick={pick} goStudio={goStudio} />;

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
            <button className="btn sm" onClick={() => setSettings({ playLayout: 'big' })} title="Full-width piano with keyboard hints">
              <Maximize2 /> Big piano
            </button>
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
                {keymap === 'real' && (
                  <>
                    <kbd>Q</kbd>–<kbd>P</kbd> <kbd>Z</kbd>–<kbd>/</kbd> white keys, row above for black ·{' '}
                  </>
                )}
                {keymap === 'full' && (
                  <>
                    <kbd>1</kbd>–<kbd>M</kbd> white keys, <kbd>Shift</kbd> for black ·{' '}
                  </>
                )}
                {keymap === 'classic' && (
                  <>
                    <kbd>Z</kbd>–<kbd>/</kbd> lower octave, <kbd>Q</kbd>–<kbd>]</kbd> upper octave ·{' '}
                  </>
                )}
                {keymap === 'custom' && <>Your custom keys · </>}
                <kbd>←</kbd>
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
