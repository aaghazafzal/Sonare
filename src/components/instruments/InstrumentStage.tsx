import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Music2 } from 'lucide-react';
import { Keyboard, KeyboardMinimap } from './Keyboard';
import { Fretboard, tuningsFor } from './Fretboard';
import { DrumKit, DrumPads } from './DrumKit';
import { Flute, PanFlute } from './Wind';
import { Mallets } from './Mallets';
import { Segmented } from '../ui';
import { noteOff, noteOn, strike, useLive } from '../../audio/live';
import { drumKeyLabels, pianoKeyLabels } from '../../audio/input';
import { useSettings, type LabelMode } from '../../theme/settings';
import { isKitId, VIEW_LABELS, type ViewKind } from '../../lib/instruments';
import { CHORD_TYPES, GUITAR_CHORDS, isBlack, NOTE_NAMES, SCALES, scaleNotes } from '../../lib/notes';

const WHITE_COUNT: Record<number, number> = { 49: 29, 61: 36, 76: 45, 88: 52 };

function whitesToSpan(low: number, whites: number) {
  let m = low;
  let w = 0;
  while (w < whites - 1 || isBlack(m)) {
    m++;
    if (!isBlack(m)) w++;
  }
  return m;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function windBase(id: string) {
  if (/piccolo|whistle/.test(id)) return 74;
  if (/recorder|ocarina/.test(id)) return 72;
  if (/baritone|bassoon/.test(id)) return 38;
  if (/tenor/.test(id)) return 46;
  if (/alto|^saxophone|clarinet|english/.test(id)) return 53;
  if (/soprano|oboe/.test(id)) return 60;
  return 62;
}
function malletBase(id: string) {
  if (/glock|celesta|music-box|tinkle/.test(id)) return 72;
  if (/xylo|steel/.test(id)) return 65;
  if (/tubular/.test(id)) return 60;
  return 48;
}

export function viewsFor(id: string, native: ViewKind): ViewKind[] {
  if (isKitId(id)) return ['drums'];
  const base: ViewKind[] = ['keyboard'];
  if (native !== 'keyboard') base.push(native);
  return base;
}

export function InstrumentStage({
  instrumentId,
  view,
  onViewChange,
  nativeView,
  compact = false,
}: {
  instrumentId: string;
  view: ViewKind;
  onViewChange: (v: ViewKind) => void;
  nativeView: ViewKind;
  compact?: boolean;
}) {
  const active = useLive((s) => s.active);
  const octave = useLive((s) => s.octave);
  const chord = useLive((s) => s.chord);
  const setLive = useLive((s) => s.set);
  const settings = useSettings();
  const skins = settings.skins;
  const [wrapRef, width] = useWidth<HTMLDivElement>();

  /* keyboard */
  const desiredWhites = WHITE_COUNT[settings.keyboardKeys] ?? 36;
  const whites = Math.max(8, Math.min(desiredWhites, Math.floor(width / (compact ? 20 : 22))));
  const [kbLow, setKbLow] = useState(36);
  const kbHigh = Math.min(108, whitesToSpan(kbLow, whites));
  useEffect(() => {
    // keep the computer-keyboard octave in view when it changes
    const lo = 48 + octave * 12;
    const hi = lo + 31;
    if (lo < kbLow || hi > kbHigh) {
      let next = Math.max(21, lo - 12);
      while (isBlack(next)) next--;
      setKbLow(next);
    }
  }, [octave]);
  const pianoLabels = useMemo(() => pianoKeyLabels(octave), [octave]);
  const drumLabels = useMemo(() => drumKeyLabels(), []);

  /* fretboard */
  const tunings = tuningsFor(instrumentId, view === 'keyboard' ? nativeView : view);
  const [tuningId, setTuningId] = useState(tunings[0].id);
  const tuning = tunings.find((t) => t.id === tuningId) ?? tunings[0];
  const [held, setHeld] = useState<Record<string, true>>({});
  const fretless = view === 'strings';
  const frets = fretless ? 14 : view === 'bass' ? Math.min(settings.guitarFrets, 17) : settings.guitarFrets;

  /* drums */
  const [drumLayout, setDrumLayout] = useState<'kit' | 'pads'>('kit');

  /* wind + mallets */
  const [root, setRoot] = useState(2);
  const [scale, setScale] = useState('major');
  const windNotes = useMemo(
    () =>
      scaleNotes(
        root,
        scale,
        Math.floor((windBase(instrumentId) - root) / 12) * 12 + octave * 12,
        scale === 'chromatic' ? 25 : 15,
      ),
    [root, scale, instrumentId, octave],
  );
  const malletLow = malletBase(instrumentId) + octave * 12;
  const naturalsFit = Math.max(10, Math.min(22, Math.floor(width / 40)));
  const malletHigh = Math.min(108, whitesToSpan(malletLow, naturalsFit));
  const [malletNames, setMalletNames] = useState(true);

  const views = viewsFor(instrumentId, nativeView);

  const strum = (frets: number[], up = false) => {
    const order = tuning.strings.map((_, i) => i);
    if (up) order.reverse();
    let delay = 0;
    order.forEach((s) => {
      const f = frets[s] ?? -1;
      if (f < 0 || s >= tuning.strings.length) return;
      setTimeout(() => {
        strike(tuning.strings[s] + f, undefined, 1400);
        setHeld((h) => ({ ...h, [`${s}:${f}`]: true }));
        setTimeout(() => setHeld((h) => {
          const n = { ...h };
          delete n[`${s}:${f}`];
          return n;
        }), 600);
      }, delay);
      delay += 26;
    });
  };
  const [lastChord, setLastChord] = useState<number[] | null>(null);

  return (
    <div className={`stage ${compact ? 'compact' : ''}`}>
      <div className="stage-bar">
        {views.length > 1 && (
          <Segmented
            value={view}
            onChange={onViewChange}
            options={views.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
          />
        )}

        {view === 'keyboard' && (
          <>
            <select
              className="select"
              value={settings.keyboardKeys}
              onChange={(e) => settings.update({ keyboardKeys: Number(e.target.value) as 49 | 61 | 76 | 88 })}
              aria-label="Keyboard size"
            >
              {[49, 61, 76, 88].map((n) => (
                <option key={n} value={n}>
                  {n} keys
                </option>
              ))}
            </select>
            <select
              className="select"
              value={settings.keyboardLabels}
              onChange={(e) => settings.update({ keyboardLabels: e.target.value as LabelMode })}
              aria-label="Key labels"
            >
              <option value="none">No labels</option>
              <option value="c">Octave labels</option>
              <option value="all">All note names</option>
              <option value="keys">Computer keys</option>
            </select>
            <select className="select" value={chord} onChange={(e) => setLive({ chord: e.target.value })} aria-label="Chord mode">
              {Object.entries(CHORD_TYPES).map(([k, c]) => (
                <option key={k} value={k}>
                  {k === 'off' ? 'Chord: off' : `Chord: ${c.label}`}
                </option>
              ))}
            </select>
            <div className="spacer" />
            <button className="btn icon ghost" title="Scroll down an octave" onClick={() => setKbLow((l) => Math.max(21, l - 12))}>
              <ChevronLeft />
            </button>
            <span className="mono faint stage-range">
              {NOTE_NAMES[kbLow % 12]}{Math.floor(kbLow / 12) - 1}–{NOTE_NAMES[kbHigh % 12]}{Math.floor(kbHigh / 12) - 1}
            </span>
            <button className="btn icon ghost" title="Scroll up an octave" onClick={() => setKbLow((l) => Math.min(108 - (kbHigh - kbLow), l + 12))}>
              <ChevronRight />
            </button>
          </>
        )}

        {(view === 'guitar' || view === 'bass' || view === 'strings') && (
          <>
            {tunings.length > 1 && (
              <select className="select" value={tuning.id} onChange={(e) => setTuningId(e.target.value)} aria-label="Tuning">
                {tunings.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
            {tunings.length === 1 && <span className="tag">{tuning.label}</span>}
            <div className="spacer" />
            <span className="faint stage-hint">Click or drag across the neck · keyboard notes show as rings</span>
          </>
        )}

        {view === 'drums' && (
          <>
            <Segmented
              value={drumLayout}
              onChange={setDrumLayout}
              options={[
                { value: 'kit', label: 'Kit' },
                { value: 'pads', label: 'Pads' },
              ]}
            />
            <div className="spacer" />
            <span className="faint stage-hint">
              Keys: <kbd>X</kbd> kick <kbd>C</kbd> snare <kbd>F</kbd> hat <kbd>G</kbd> open hat <kbd>R</kbd> crash <kbd>I</kbd> ride
            </span>
          </>
        )}

        {view === 'wind' && (
          <>
            <select className="select" value={root} onChange={(e) => setRoot(Number(e.target.value))} aria-label="Key">
              {NOTE_NAMES.map((n, i) => (
                <option key={n} value={i}>
                  Key of {n}
                </option>
              ))}
            </select>
            <select className="select" value={scale} onChange={(e) => setScale(e.target.value)} aria-label="Scale">
              {Object.entries(SCALES).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
          </>
        )}

        {view === 'mallets' && (
          <>
            <Segmented
              value={malletNames ? 'on' : 'off'}
              onChange={(v) => setMalletNames(v === 'on')}
              options={[
                { value: 'on', label: 'Note names' },
                { value: 'off', label: 'Plain bars' },
              ]}
            />
          </>
        )}
      </div>

      {view === 'guitar' && (
        <div className="chord-strip">
          <Music2 className="faint" size={14} />
          {GUITAR_CHORDS.map((c) => (
            <button
              key={c.name}
              className="btn sm"
              onPointerDown={() => {
                setLastChord(c.frets);
                strum(c.frets);
              }}
            >
              {c.name}
            </button>
          ))}
          <div className="spacer" />
          <button className="btn sm" disabled={!lastChord} onClick={() => lastChord && strum(lastChord)}>
            Strum ↓
          </button>
          <button className="btn sm" disabled={!lastChord} onClick={() => lastChord && strum(lastChord, true)}>
            Strum ↑
          </button>
        </div>
      )}

      <div className="stage-body" ref={wrapRef}>
        {view === 'keyboard' && (
          <div className="kb-wrap">
            {settings.showMinimap && !compact && (
              <KeyboardMinimap
                low={kbLow}
                count={kbHigh - kbLow}
                onChange={setKbLow}
                active={active}
                mapped={[48 + octave * 12, 48 + octave * 12 + 31]}
              />
            )}
            <Keyboard
              low={kbLow}
              high={kbHigh}
              active={active}
              onDown={(m, v) => noteOn(m, v)}
              onUp={(m) => noteOff(m)}
              skin={skins.keyboard}
              labels={settings.keyboardLabels}
              keyLabels={pianoLabels}
              height={compact ? 150 : 230}
            />
          </div>
        )}

        {(view === 'guitar' || view === 'bass' || view === 'strings') && (
          <div className="fb-wrap">
            <Fretboard
              strings={tuning.strings}
              frets={frets}
              fretless={fretless}
              skin={skins.guitar}
              active={active}
              held={held}
              showLabels={settings.guitarLabels}
              leftHanded={settings.leftHanded}
              onDown={(s, f) => {
                setHeld((h) => ({ ...h, [`${s}:${f}`]: true }));
                noteOn(tuning.strings[s] + f);
              }}
              onUp={(s, f) => {
                setHeld((h) => {
                  const n = { ...h };
                  delete n[`${s}:${f}`];
                  return n;
                });
                noteOff(tuning.strings[s] + f);
              }}
            />
          </div>
        )}

        {view === 'drums' &&
          (drumLayout === 'kit' ? (
            <div className="dk-wrap">
              <DrumKit skin={skins.drums} active={active} onDown={(m) => noteOn(m)} onUp={(m) => noteOff(m)} keyLabels={drumLabels} />
            </div>
          ) : (
            <DrumPads skin={skins.drums} active={active} onDown={(m) => noteOn(m)} onUp={(m) => noteOff(m)} keyLabels={drumLabels} />
          ))}

        {view === 'wind' &&
          (/pan-flute/.test(instrumentId) ? (
            <PanFlute notes={windNotes} root={root} skin={skins.wind} active={active} onDown={(m) => noteOn(m)} onUp={(m) => noteOff(m)} keyLabels={pianoLabels} />
          ) : (
            <Flute notes={windNotes} root={root} skin={skins.wind} active={active} onDown={(m) => noteOn(m)} onUp={(m) => noteOff(m)} keyLabels={pianoLabels} />
          ))}

        {view === 'mallets' && (
          <div className="ml-wrap">
            <Mallets
              low={malletLow}
              high={malletHigh}
              skin={skins.mallets}
              active={active}
              onDown={(m) => noteOn(m)}
              onUp={(m) => noteOff(m)}
              keyLabels={pianoLabels}
              showNames={malletNames}
            />
          </div>
        )}
      </div>
    </div>
  );
}
