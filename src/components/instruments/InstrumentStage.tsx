import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Music2 } from 'lucide-react';
import { Keyboard, KeyboardMinimap } from './Keyboard';
import { Fretboard, tuningsFor } from './Fretboard';
import { DrumKit, DrumPads } from './DrumKit';
import { Flute, PanFlute } from './Wind';
import { Mallets } from './Mallets';
import { Segmented } from '../ui';
import { noteOff, noteOn, strike, useLive } from '../../audio/live';
import { drumKeyLabels, mappedRange, pianoKeyLabels } from '../../audio/input';
import { useSettings, type LabelMode } from '../../theme/settings';
import { isKitId, VIEW_LABELS, type ViewKind } from '../../lib/instruments';
import { CHORD_TYPES, GUITAR_CHORDS, isBlack, NOTE_NAMES, SCALES, scaleNotes } from '../../lib/notes';
import { useMobile, useMobileStore } from '../../lib/useMobile';

const WHITE_COUNT: Record<number, number> = { 49: 29, 61: 36, 76: 45, 88: 52 };

export function whitesToSpan(low: number, whites: number) {
  let m = low;
  let w = 0;
  while (w < whites - 1 || isBlack(m)) {
    m++;
    if (!isBlack(m)) w++;
  }
  return m;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 1000, height: 400 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // measure right away so the first paint is already sized; the observer keeps it current
    setSize({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    const onResize = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return [ref, size.width, size.height] as const;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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
  const [wrapRef, width, height] = useSize<HTMLDivElement>();
  const mobile = useMobile();

  /* keyboard */
  const desiredWhites = WHITE_COUNT[settings.keyboardKeys] ?? 36;
  // phones get fewer, finger-wide keys; scroll with the arrows or the overview strip
  const whites = mobile
    ? clamp(Math.floor(width / (mobile === 'portrait' ? 42 : 36)), 7, desiredWhites)
    : Math.max(8, Math.min(desiredWhites, Math.floor(width / (compact ? 20 : 22))));
  const [kbLow, setKbLow] = useState(() => (useMobileStore.getState().mode ? 60 : 36));
  const showMinimap = settings.showMinimap && (!compact || !!mobile);
  // a tall phone screen stacks two rows (the upper row continues where the lower one ends)
  const kbSpace = height - (showMinimap ? 42 : 4);
  const kbRows = mobile === 'portrait' && kbSpace >= 520 ? 2 : 1;
  // stacked rows are whole octaves (C…B) so no black key is split between them
  const rowOctaves = Math.max(1, Math.floor(whites / 7));
  const rowLow = kbRows === 2 ? Math.min(84, kbLow - (kbLow % 12)) : kbLow;
  const kbHigh = kbRows === 2 ? rowLow + rowOctaves * 12 - 1 : Math.min(108, whitesToSpan(kbLow, whites));
  const kbLow2 = rowLow + rowOctaves * 12;
  const kbHigh2 = Math.min(108, kbLow2 + rowOctaves * 12 - 1);
  const kbTop = kbRows === 2 ? kbHigh2 : kbHigh;
  const kbHeight = mobile ? clamp((kbSpace - (kbRows - 1) * 10) / kbRows, 140, kbRows === 2 ? 320 : 440) : compact ? 150 : 230;
  useEffect(() => {
    if (mobile) {
      // small keyboards follow the octave buttons directly
      setKbLow(clamp((kbRows === 2 ? 48 : 60) + octave * 12, 21, 96));
      return;
    }
    // keep the computer-keyboard octave in view when it changes
    const lo = 48 + octave * 12;
    const hi = lo + 31;
    if (lo < kbLow || hi > kbHigh) {
      let next = Math.max(21, lo - 12);
      while (isBlack(next)) next--;
      setKbLow(next);
    }
  }, [octave, kbRows]);
  const pianoLabels = useMemo(() => pianoKeyLabels(octave, settings.keymap), [octave, settings.keymap, settings.customKeys]);
  const mapped = useMemo(() => mappedRange(octave, settings.keymap), [octave, settings.keymap, settings.customKeys]);
  const drumLabels = useMemo(() => drumKeyLabels(), []);

  /* fretboard */
  const tunings = tuningsFor(instrumentId, view === 'keyboard' ? nativeView : view);
  const [tuningId, setTuningId] = useState(tunings[0].id);
  const tuning = tunings.find((t) => t.id === tuningId) ?? tunings[0];
  const [held, setHeld] = useState<Record<string, true>>({});
  const fretless = view === 'strings';
  const maxFrets = fretless ? 14 : view === 'bass' ? Math.min(settings.guitarFrets, 17) : settings.guitarFrets;
  // on phones the neck is sized to the space: upright in portrait, shorter and taller in landscape
  const neckVertical = mobile === 'portrait';
  const neckLength = !mobile
    ? 1200
    : neckVertical
      ? clamp((280 * height) / Math.max(1, width), 420, 1200)
      : clamp((280 * width) / Math.max(1, height - 4), 560, 1200);
  const frets = mobile ? clamp(Math.round((neckLength - 64) / (neckVertical ? 88 : 80)), 4, maxFrets) : maxFrets;

  /* drums */
  const [drumLayout, setDrumLayout] = useState<'kit' | 'pads'>(() => (useMobileStore.getState().mode === 'portrait' ? 'pads' : 'kit'));

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
  const naturalsFit = mobile ? clamp(Math.floor(width / 46), 7, 15) : Math.max(10, Math.min(22, Math.floor(width / 40)));
  // tall phone screens: two one-octave frames stacked, like the keyboard
  const malletRows = mobile === 'portrait' && height >= 560 ? 2 : 1;
  const malletRowLow = malletLow - (((malletLow % 12) + 12) % 12);
  const malletLength = mobile
    ? clamp(Math.max(naturalsFit * 80, (470 * width) / Math.max(1, (height - (malletRows - 1) * 12) / malletRows)), 500, 1200)
    : 1200;
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
    <div className={`stage ${compact ? 'compact' : ''} ${mobile ? 'is-mobile' : ''}`} data-view={view}>
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
            {!mobile && <select
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
            </select>}
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
              {NOTE_NAMES[rowLow % 12]}{Math.floor(rowLow / 12) - 1}–{NOTE_NAMES[kbTop % 12]}{Math.floor(kbTop / 12) - 1}
            </span>
            <button className="btn icon ghost" title="Scroll up an octave" onClick={() => setKbLow((l) => Math.min(108 - (kbTop - rowLow), l + 12))}>
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
            {showMinimap && (
              <KeyboardMinimap
                low={rowLow}
                count={kbTop - rowLow}
                onChange={setKbLow}
                active={active}
                mapped={mapped}
              />
            )}
            {kbRows === 2 && kbLow2 < kbHigh2 && (
              <Keyboard
                low={kbLow2}
                high={kbHigh2}
                active={active}
                onDown={(m, v) => noteOn(m, v)}
                onUp={(m) => noteOff(m)}
                skin={skins.keyboard}
                labels={settings.keyboardLabels}
                keyLabels={pianoLabels}
                height={kbHeight}
              />
            )}
            <Keyboard
              low={rowLow}
              high={kbHigh}
              active={active}
              onDown={(m, v) => noteOn(m, v)}
              onUp={(m) => noteOff(m)}
              skin={skins.keyboard}
              labels={settings.keyboardLabels}
              keyLabels={pianoLabels}
              height={kbHeight}
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
              vertical={neckVertical}
              length={neckLength}
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
            <Flute notes={windNotes} root={root} skin={skins.wind} active={active} onDown={(m) => noteOn(m)} onUp={(m) => noteOff(m)} keyLabels={pianoLabels} compact={mobile === 'portrait'} />
          ))}

        {view === 'mallets' && malletRows === 2 && (
          <div className="ml-wrap ml-stack">
            {[malletRowLow + 12, malletRowLow].map((lo) => (
              <Mallets
                key={lo}
                low={lo}
                high={Math.min(108, lo + 11)}
                skin={skins.mallets}
                active={active}
                onDown={(m) => noteOn(m)}
                onUp={(m) => noteOff(m)}
                keyLabels={pianoLabels}
                showNames={malletNames}
                length={malletLength}
              />
            ))}
          </div>
        )}

        {view === 'mallets' && malletRows === 1 && (
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
              length={malletLength}
            />
          </div>
        )}
      </div>
    </div>
  );
}
