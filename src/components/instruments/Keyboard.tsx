import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { isBlack, noteName, pitchClass } from '../../lib/notes';
import type { KeyboardSkin } from '../../theme/presets';
import type { LabelMode } from '../../theme/settings';

// black keys sit slightly off-centre on real pianos
const BLACK_OFFSET: Record<number, number> = { 1: -0.12, 3: 0.12, 6: -0.14, 8: 0, 10: 0.14 };

export function keyboardSkinVars(skin: KeyboardSkin): CSSProperties {
  return {
    ['--wk' as string]: skin.whiteKey,
    ['--bk' as string]: skin.blackKey,
    ['--pressed' as string]: skin.pressed,
    ['--klabel' as string]: skin.label,
    ['--case' as string]: skin.caseColor,
    ['--felt' as string]: skin.felt,
    ['--depth' as string]: String(skin.keyDepth),
  };
}

export function Keyboard({
  low,
  high,
  active,
  onDown,
  onUp,
  skin,
  labels = 'c',
  keyLabels,
  height = 210,
  showCase = true,
  className = '',
  renderLabel,
  marked,
}: {
  low: number;
  high: number;
  active: Record<number, true | undefined>;
  onDown: (midi: number, vel: number) => void;
  onUp: (midi: number) => void;
  skin: KeyboardSkin;
  labels?: LabelMode;
  keyLabels?: Map<number, string>;
  height?: number;
  showCase?: boolean;
  className?: string;
  /** replaces the built-in labels (used by the big piano for keycaps and note names) */
  renderLabel?: (midi: number, black: boolean) => ReactNode;
  /** keys drawn with a selection outline (keybind editor) */
  marked?: Record<number, true | undefined>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, number>());

  const { whites, blacks } = useMemo(() => {
    const whites: number[] = [];
    const blacks: { midi: number; pos: number }[] = [];
    for (let m = low; m <= high; m++) {
      if (isBlack(m)) blacks.push({ midi: m, pos: whites.length });
      else whites.push(m);
    }
    return { whites, blacks };
  }, [low, high]);

  const ww = 100 / whites.length;
  const bw = ww * 0.6;

  const hit = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const key = el?.closest<HTMLElement>('[data-midi]');
    if (!key || !ref.current?.contains(key)) return null;
    const rect = key.getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (y - rect.top) / rect.height));
    return { midi: Number(key.dataset.midi), vel: 0.38 + rel * 0.62 };
  };

  const press = (id: number, x: number, y: number) => {
    const h = hit(x, y);
    const prev = pointers.current.get(id);
    if (h?.midi === prev) return;
    if (prev !== undefined) onUp(prev);
    if (h) {
      pointers.current.set(id, h.midi);
      onDown(h.midi, h.vel);
    } else pointers.current.delete(id);
  };
  const release = (id: number) => {
    const prev = pointers.current.get(id);
    if (prev !== undefined) onUp(prev);
    pointers.current.delete(id);
  };

  const label = (m: number) => {
    const k = keyLabels?.get(m);
    if (labels === 'keys') return k ? <span className="k-hint">{k}</span> : null;
    if (labels === 'all') return <span className="k-name">{noteName(m, pitchClass(m) === 0)}</span>;
    if (labels === 'c' && pitchClass(m) === 0) return <span className="k-name">{noteName(m)}</span>;
    return null;
  };

  return (
    <div
      className={`kb ${showCase ? 'kb-case' : ''} finish-${skin.caseFinish} ${className}`}
      style={{ ...keyboardSkinVars(skin), height }}
    >
      {showCase && <div className="kb-felt" />}
      <div
        ref={ref}
        className="kb-keys"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          press(e.pointerId, e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (pointers.current.has(e.pointerId)) press(e.pointerId, e.clientX, e.clientY);
        }}
        onPointerUp={(e) => release(e.pointerId)}
        onPointerCancel={(e) => release(e.pointerId)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {whites.map((m, i) => (
          <div
            key={m}
            data-midi={m}
            className={`wk ${active[m] ? 'down' : ''} ${pitchClass(m) === 0 ? 'is-c' : ''} ${marked?.[m] ? 'marked' : ''}`}
            style={{ left: `${i * ww}%`, width: `${ww}%` }}
          >
            {renderLabel ? renderLabel(m, false) : label(m)}
          </div>
        ))}
        {blacks.map(({ midi, pos }) => (
          <div
            key={midi}
            data-midi={midi}
            className={`bk ${active[midi] ? 'down' : ''} ${marked?.[midi] ? 'marked' : ''}`}
            style={{ left: `${pos * ww - bw / 2 + BLACK_OFFSET[pitchClass(midi)] * bw}%`, width: `${bw}%` }}
          >
            {renderLabel
              ? renderLabel(midi, true)
              : labels === 'keys' && keyLabels?.get(midi) && <span className="k-hint">{keyLabels.get(midi)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 88-key overview with a draggable window showing the visible range. */
export function KeyboardMinimap({
  low,
  count,
  onChange,
  active,
  mapped,
}: {
  low: number;
  count: number; // visible key span in semitones
  onChange: (low: number) => void;
  active: Record<number, true | undefined>;
  mapped?: [number, number];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const FIRST = 21;
  const LAST = 108;
  const whites: number[] = [];
  for (let m = FIRST; m <= LAST; m++) if (!isBlack(m)) whites.push(m);
  const wIndex = (m: number) => whites.filter((w) => w < m).length;
  const ww = 100 / whites.length;
  const winL = wIndex(low) * ww;
  const winR = wIndex(low + count) * ww;

  const move = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const frac = (clientX - r.left) / r.width;
    const centre = whites[Math.max(0, Math.min(whites.length - 1, Math.round(frac * whites.length)))];
    let next = centre - Math.round(count / 2);
    next = Math.max(FIRST, Math.min(LAST - count, next));
    while (isBlack(next)) next--;
    onChange(next);
  };

  return (
    <div
      ref={ref}
      className="kb-mini"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && move(e.clientX)}
      title="Drag to scroll the keyboard"
    >
      {whites.map((m, i) => (
        <i key={m} className={`mw ${active[m] ? 'down' : ''}`} style={{ left: `${i * ww}%`, width: `${ww}%` }} />
      ))}
      {Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i)
        .filter(isBlack)
        .map((m) => (
          <i
            key={m}
            className={`mb ${active[m] ? 'down' : ''}`}
            style={{ left: `${wIndex(m) * ww - ww * 0.3}%`, width: `${ww * 0.6}%` }}
          />
        ))}
      {mapped && (
        <span
          className="kb-mini-mapped"
          style={{ left: `${wIndex(mapped[0]) * ww}%`, width: `${(wIndex(mapped[1]) - wIndex(mapped[0])) * ww}%` }}
        />
      )}
      <span className="kb-mini-window" style={{ left: `${winL}%`, width: `${winR - winL}%` }} />
    </div>
  );
}
