import { useId, useMemo, useRef } from 'react';
import { noteName } from '../../lib/notes';
import type { GuitarSkin } from '../../theme/presets';

export interface Tuning {
  id: string;
  label: string;
  strings: number[]; // low to high, midi
}

export const TUNINGS: Record<string, Tuning[]> = {
  guitar: [
    { id: 'std', label: 'Standard E', strings: [40, 45, 50, 55, 59, 64] },
    { id: 'dropd', label: 'Drop D', strings: [38, 45, 50, 55, 59, 64] },
    { id: 'dadgad', label: 'DADGAD', strings: [38, 45, 50, 55, 57, 62] },
    { id: 'openg', label: 'Open G', strings: [38, 43, 50, 55, 59, 62] },
    { id: 'half', label: 'Half-step down', strings: [39, 44, 49, 54, 58, 63] },
  ],
  bass: [
    { id: 'b4', label: '4-string E', strings: [28, 33, 38, 43] },
    { id: 'b5', label: '5-string B', strings: [23, 28, 33, 38, 43] },
    { id: 'bdrop', label: 'Drop D', strings: [26, 33, 38, 43] },
  ],
  violin: [{ id: 'vn', label: 'Violin G D A E', strings: [55, 62, 69, 76] }],
  viola: [{ id: 'va', label: 'Viola C G D A', strings: [48, 55, 62, 69] }],
  cello: [{ id: 'vc', label: 'Cello C G D A', strings: [36, 43, 50, 57] }],
  contrabass: [{ id: 'cb', label: 'Double bass E A D G', strings: [28, 33, 38, 43] }],
  ukulele: [{ id: 'uke', label: 'Ukulele G C E A', strings: [67, 60, 64, 69] }],
  banjo: [{ id: 'banjo', label: 'Open G (5-string)', strings: [67, 50, 55, 59, 62] }],
};

export function tuningsFor(instrumentId: string, view: string): Tuning[] {
  if (/violin/.test(instrumentId)) return TUNINGS.violin;
  if (/viola/.test(instrumentId)) return TUNINGS.viola;
  if (/cello/.test(instrumentId)) return TUNINGS.cello;
  if (/contrabass|double-bass/.test(instrumentId)) return TUNINGS.contrabass;
  if (/ukulele/.test(instrumentId)) return TUNINGS.ukulele;
  if (/banjo/.test(instrumentId)) return TUNINGS.banjo;
  if (view === 'bass') return TUNINGS.bass;
  if (view === 'strings') return TUNINGS.violin;
  return TUNINGS.guitar;
}

const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];

/** Horizontal neck. Fretted (guitar, bass) or fretless with position tapes (violin family). */
export function Fretboard({
  strings,
  frets,
  fretless = false,
  skin,
  active,
  held,
  onDown,
  onUp,
  showLabels,
  leftHanded,
}: {
  strings: number[];
  frets: number;
  fretless?: boolean;
  skin: GuitarSkin;
  active: Record<number, true | undefined>;
  held: Record<string, true | undefined>; // `${string}:${fret}` currently pressed on screen
  onDown: (stringIdx: number, fret: number) => void;
  onUp: (stringIdx: number, fret: number) => void;
  showLabels: boolean;
  leftHanded: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const W = 1200;
  const H = 280;
  const openW = 64; // area left of the nut for open strings
  const n = strings.length;
  const padY = 22;
  const neckH = H - padY * 2;
  const gap = neckH / n;
  // fret spacing follows the real 12th-root-of-2 rule, normalised to the drawable width
  const fretX = useMemo(() => {
    const scale = 1 / (1 - Math.pow(2, -frets / 12));
    const xs = [openW];
    for (let f = 1; f <= frets; f++) xs.push(openW + (W - openW - 10) * scale * (1 - Math.pow(2, -f / 12)));
    return xs;
  }, [frets]);
  // highest string drawn at top, like looking down at the neck while playing
  const yOf = (s: number) => padY + gap * (n - 1 - s) + gap / 2;
  const centreX = (f: number) => (f === 0 ? openW / 2 : (fretX[f - 1] + fretX[f]) / 2);

  const pointers = useRef(new Map<number, [number, number]>());
  const svgRef = useRef<SVGSVGElement>(null);

  const locate = (clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    let x = ((clientX - r.left) / r.width) * W;
    if (leftHanded) x = W - x;
    const y = ((clientY - r.top) / r.height) * H;
    const s = n - 1 - Math.floor((y - padY) / gap);
    if (s < 0 || s >= n) return null;
    if (x < openW) return [s, 0];
    for (let f = 1; f <= frets; f++) if (x < fretX[f]) return [s, f];
    return null;
  };

  const press = (id: number, cx: number, cy: number) => {
    const loc = locate(cx, cy);
    const prev = pointers.current.get(id);
    if (prev && loc && prev[0] === loc[0] && prev[1] === loc[1]) return;
    if (prev) onUp(prev[0], prev[1]);
    if (loc) {
      pointers.current.set(id, loc);
      onDown(loc[0], loc[1]);
    } else pointers.current.delete(id);
  };
  const release = (id: number) => {
    const prev = pointers.current.get(id);
    if (prev) onUp(prev[0], prev[1]);
    pointers.current.delete(id);
  };

  // where to draw "active" notes coming from other inputs: lowest-fret position
  const ghostPositions = useMemo(() => {
    const out: [number, number][] = [];
    for (const k of Object.keys(active)) {
      const midi = Number(k);
      let best: [number, number] | null = null;
      for (let s = 0; s < n; s++) {
        const f = midi - strings[s];
        if (f >= 0 && f <= frets && (!best || f < best[1])) best = [s, f];
      }
      if (best && !held[`${best[0]}:${best[1]}`]) out.push(best);
    }
    return out;
  }, [active, held, strings, frets, n]);

  const woodId = `wood-${uid}`;
  const grainId = `grain-${uid}`;
  const strId = `str-${uid}`;
  const fretId = `fret-${uid}`;

  return (
    <svg
      ref={svgRef}
      className="fretboard"
      viewBox={`0 0 ${W} ${H}`}
      style={{ transform: leftHanded ? 'scaleX(-1)' : undefined }}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        press(e.pointerId, e.clientX, e.clientY);
      }}
      onPointerMove={(e) => pointers.current.has(e.pointerId) && press(e.pointerId, e.clientX, e.clientY)}
      onPointerUp={(e) => release(e.pointerId)}
      onPointerCancel={(e) => release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <linearGradient id={woodId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={skin.wood} stopOpacity="0.92" />
          <stop offset="0.5" stopColor={skin.wood} />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
        <filter id={grainId} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.22" numOctaves="3" seed="7" />
          <feColorMatrix values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${skin.grain * 0.9} 0`} />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <linearGradient id={strId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.45" stopColor={skin.string} />
          <stop offset="1" stopColor="#000" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id={fretId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.4" />
          <stop offset="0.35" stopColor={skin.fret} />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor={skin.fret} />
        </linearGradient>
      </defs>

      {/* neck */}
      <rect x={openW} y={padY - 4} width={W - openW} height={neckH + 8} fill={skin.binding} rx="2" />
      <rect x={openW} y={padY - 1} width={W - openW} height={neckH + 2} fill={`url(#${woodId})`} />
      <rect x={openW} y={padY - 1} width={W - openW} height={neckH + 2} fill="#000" filter={`url(#${grainId})`} />

      {/* nut */}
      <rect x={openW - 9} y={padY - 4} width={10} height={neckH + 8} fill={skin.nut} rx="1.5" />
      <rect x={openW - 9} y={padY - 4} width={3} height={neckH + 8} fill="#000" opacity="0.12" />

      {/* inlays / position tapes */}
      {skin.inlay !== 'none' &&
        INLAYS.filter((f) => f <= frets).map((f) => {
          const cx = centreX(f);
          const w = fretX[f] - fretX[f - 1];
          if (fretless)
            return <rect key={f} x={fretX[f] - 1.5} y={padY} width={3} height={neckH} fill={skin.inlayColor} opacity="0.18" />;
          return skin.inlay === 'blocks' ? (
            <rect key={f} x={cx - w * 0.3} y={padY + neckH * 0.18} width={w * 0.6} height={neckH * 0.64} fill={skin.inlayColor} opacity="0.85" rx="2" />
          ) : (
            <circle key={f} cx={cx} cy={padY + neckH / 2} r={Math.min(9, w * 0.16)} fill={skin.inlayColor} opacity="0.9" />
          );
        })}
      {!fretless && frets >= 12 && skin.inlay !== 'none' && (
        skin.inlay === 'blocks' ? (
          <rect
            x={centreX(12) - (fretX[12] - fretX[11]) * 0.3}
            y={padY + neckH * 0.12}
            width={(fretX[12] - fretX[11]) * 0.6}
            height={neckH * 0.76}
            fill={skin.inlayColor}
            opacity="0.85"
            rx="2"
          />
        ) : (
          <>
            <circle cx={centreX(12)} cy={padY + neckH * 0.3} r={8} fill={skin.inlayColor} opacity="0.9" />
            <circle cx={centreX(12)} cy={padY + neckH * 0.7} r={8} fill={skin.inlayColor} opacity="0.9" />
          </>
        )
      )}

      {/* frets */}
      {!fretless &&
        fretX.slice(1).map((x, i) => (
          <rect key={i} x={x - 2.5} y={padY - 2} width={5} height={neckH + 4} fill={`url(#${fretId})`} rx="1" />
        ))}

      {/* fret numbers */}
      {fretX.slice(1).map((_, i) =>
        [1, 3, 5, 7, 9, 12, 15, 17, 19, 21].includes(i + 1) ? (
          <text
            key={i}
            x={centreX(i + 1)}
            y={H - 3}
            textAnchor="middle"
            className="fb-num"
            transform={leftHanded ? `scale(-1 1) translate(${-2 * centreX(i + 1)} 0)` : undefined}
          >
            {i + 1}
          </text>
        ) : null,
      )}

      {/* strings */}
      {strings.map((_, s) => {
        const thick = 1.2 + ((n - 1 - s) / Math.max(1, n - 1)) * (n <= 4 ? 3.4 : 2.6);
        return (
          <g key={s}>
            <rect x={0} y={yOf(s) - thick / 2 + 1.5} width={W} height={thick} fill="#000" opacity="0.28" />
            <rect x={0} y={yOf(s) - thick / 2} width={W} height={thick} fill={`url(#${strId})`} />
          </g>
        );
      })}

      {/* ghost notes from keyboard / MIDI */}
      {ghostPositions.map(([s, f]) => (
        <circle key={`g${s}:${f}`} cx={centreX(f)} cy={yOf(s)} r={11} fill="none" stroke={skin.pressed} strokeWidth="2.5" />
      ))}

      {/* fingers */}
      {Object.keys(held).map((k) => {
        const [s, f] = k.split(':').map(Number);
        if (s >= n) return null;
        return (
          <g key={k}>
            <circle cx={centreX(f)} cy={yOf(s)} r={13} fill={skin.pressed} />
            {showLabels && (
              <text
                x={centreX(f)}
                y={yOf(s) + 4}
                textAnchor="middle"
                className="fb-label on"
                transform={leftHanded ? `scale(-1 1) translate(${-2 * centreX(f)} 0)` : undefined}
              >
                {noteName(strings[s] + f, false)}
              </text>
            )}
          </g>
        );
      })}

      {/* open string names */}
      {showLabels &&
        strings.map((m, s) => (
          <text
            key={`o${s}`}
            x={openW / 2 - 6}
            y={yOf(s) + 4}
            textAnchor="middle"
            className="fb-open"
            transform={leftHanded ? `scale(-1 1) translate(${-2 * (openW / 2 - 6)} 0)` : undefined}
          >
            {noteName(m)}
          </text>
        ))}
    </svg>
  );
}
