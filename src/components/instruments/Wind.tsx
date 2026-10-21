import { useId } from 'react';
import { noteName } from '../../lib/notes';
import type { WindSkin } from '../../theme/presets';

/** Six-hole fingering (top to bottom). 1 closed, 0.5 half-holed, 0 open — relative to the scale root. */
const FINGERING: number[][] = [
  [1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 0.5],
  [1, 1, 1, 1, 1, 0],
  [1, 1, 1, 1, 0.5, 0],
  [1, 1, 1, 1, 0, 0],
  [1, 1, 1, 0, 0, 0],
  [1, 1, 0.5, 0, 0, 0],
  [1, 1, 0, 0, 0, 0],
  [1, 0.5, 0, 0, 0, 0],
  [1, 0, 0, 0, 0, 0],
  [0, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
];

export function fingeringFor(midi: number, root: number) {
  const rel = midi - root;
  const st = ((rel % 12) + 12) % 12;
  return { holes: FINGERING[st], overblow: rel >= 12 };
}

interface Props {
  notes: number[];
  root: number;
  skin: WindSkin;
  active: Record<number, true | undefined>;
  onDown: (midi: number) => void;
  onUp: (midi: number) => void;
  keyLabels?: Map<number, string>;
}

function NoteButtons({ notes, active, onDown, onUp, keyLabels }: Omit<Props, 'skin' | 'root'>) {
  return (
    <div className="wind-notes">
      {notes.map((m) => (
        <button
          key={m}
          type="button"
          className={`wind-note ${active[m] ? 'down' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
            onDown(m);
          }}
          onPointerUp={() => onUp(m)}
          onPointerLeave={(e) => e.buttons && onUp(m)}
          onPointerEnter={(e) => e.buttons && onDown(m)}
          onPointerCancel={() => onUp(m)}
        >
          <span>{noteName(m, false)}</span>
          <small className="mono">{Math.floor(m / 12) - 1}</small>
          {keyLabels?.get(m) && <kbd>{keyLabels.get(m)}</kbd>}
        </button>
      ))}
    </div>
  );
}

export function Flute({ notes, root, skin, active, onDown, onUp, keyLabels }: Props) {
  const uid = useId().replace(/:/g, '');
  const bodyId = `fbody-${uid}`;
  const keyId = `fkey-${uid}`;
  const grainId = `fgrain-${uid}`;
  const sounding = Object.keys(active).map(Number).sort((a, b) => b - a)[0];
  const f = sounding !== undefined ? fingeringFor(sounding, root) : null;
  const holeX = [560, 630, 700, 800, 870, 940];
  const metal = skin.finish === 'metal';

  return (
    <div className="wind">
      <svg className="flute" viewBox="0 0 1200 170">
        <defs>
          <linearGradient id={bodyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity={metal ? 0.35 : 0.2} />
            <stop offset="0.12" stopColor={skin.body} />
            <stop offset="0.32" stopColor="#fff" stopOpacity={metal ? 0.75 : 0.2} />
            <stop offset="0.45" stopColor={skin.body} />
            <stop offset="0.85" stopColor={skin.body} />
            <stop offset="1" stopColor="#000" stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id={keyId} cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="0.5" stopColor={skin.keys} />
            <stop offset="1" stopColor="#000" stopOpacity="0.45" />
          </radialGradient>
          <filter id={grainId}>
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.3" numOctaves="3" seed="4" />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.7 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
        </defs>
        <ellipse cx="600" cy="140" rx="560" ry="10" fill="#000" opacity="0.22" />
        {/* body tube in three joints */}
        <rect x="40" y="62" width="1120" height="42" rx="21" fill={`url(#${bodyId})`} />
        {!metal && <rect x="40" y="62" width="1120" height="42" rx="21" fill="#000" filter={`url(#${grainId})`} />}
        {[330, 1010].map((x) => (
          <rect key={x} x={x} y="58" width="14" height="50" rx="3" fill={`url(#${bodyId})`} stroke="#000" strokeOpacity="0.25" />
        ))}
        <rect x="40" y="62" width="24" height="42" rx="12" fill={`url(#${bodyId})`} stroke="#000" strokeOpacity="0.3" />
        {/* lip plate */}
        <ellipse cx="200" cy="72" rx="30" ry="12" fill={`url(#${keyId})`} stroke="#000" strokeOpacity="0.3" />
        <ellipse cx="200" cy="72" rx="9" ry="5" fill="#140f0a" />
        {/* tone holes */}
        {holeX.map((x, i) => {
          const v = f?.holes[i] ?? 0;
          return (
            <g key={x}>
              <circle cx={x} cy="83" r="17" fill={metal ? `url(#${keyId})` : 'none'} stroke="#000" strokeOpacity="0.35" />
              <circle cx={x} cy="83" r="9" fill="#120d09" />
              {v > 0 && (
                <path
                  d={v === 1 ? `M ${x - 13} 83 a 13 13 0 1 0 26 0 a 13 13 0 1 0 -26 0` : `M ${x - 13} 83 a 13 13 0 0 1 26 0 Z`}
                  fill={skin.pressed}
                  opacity="0.92"
                />
              )}
            </g>
          );
        })}
        {/* trill keys and rods for realism */}
        {metal && <rect x="520" y="99" width="460" height="3" rx="1.5" fill={skin.keys} opacity="0.7" />}
        {[1060, 1100].map((x) => (
          <circle key={x} cx={x} cy="83" r="11" fill={metal ? `url(#${keyId})` : '#120d09'} stroke="#000" strokeOpacity="0.3" />
        ))}
        <text x="600" y="30" textAnchor="middle" className="wind-readout">
          {sounding !== undefined ? `${noteName(sounding)}${f?.overblow ? '  · overblow' : ''}` : 'Play a note to see its fingering'}
        </text>
      </svg>
      <NoteButtons notes={notes} active={active} onDown={onDown} onUp={onUp} keyLabels={keyLabels} />
    </div>
  );
}

export function PanFlute({ notes, skin, active, onDown, onUp, keyLabels }: Props) {
  const uid = useId().replace(/:/g, '');
  const tubeId = `tube-${uid}`;
  const n = notes.length;
  const w = 1000 / n;
  return (
    <div className="wind">
      <svg className="panflute" viewBox="0 0 1040 330">
        <defs>
          <linearGradient id={tubeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity="0.35" />
            <stop offset="0.25" stopColor={skin.body} />
            <stop offset="0.4" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="0.6" stopColor={skin.body} />
            <stop offset="1" stopColor="#000" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        {notes.map((m, i) => {
          const h = 300 - (i / Math.max(1, n - 1)) * 190;
          const x = 20 + i * w;
          return (
            <g
              key={m}
              className={`pan-tube ${active[m] ? 'down' : ''}`}
              onPointerDown={(e) => {
                e.preventDefault();
                onDown(m);
              }}
              onPointerUp={() => onUp(m)}
              onPointerLeave={(e) => e.buttons && onUp(m)}
              onPointerEnter={(e) => e.buttons && onDown(m)}
            >
              <rect x={x + 3} y={14} width={w - 6} height={h} rx={(w - 6) / 2.4} fill={`url(#${tubeId})`} />
              <ellipse cx={x + w / 2} cy={20} rx={(w - 6) / 2 - 3} ry={5} fill="#120d09" />
              {active[m] && <rect x={x + 3} y={14} width={w - 6} height={h} rx={(w - 6) / 2.4} fill={skin.pressed} opacity="0.35" />}
              <text x={x + w / 2} y={14 + h - 14} textAnchor="middle" className="pan-label">
                {noteName(m, false)}
              </text>
              {keyLabels?.get(m) && (
                <text x={x + w / 2} y={14 + h - 32} textAnchor="middle" className="pan-key">
                  {keyLabels.get(m)}
                </text>
              )}
            </g>
          );
        })}
        <rect x="14" y="88" width="1012" height="22" rx="4" fill={skin.keys} opacity="0.85" />
        <rect x="14" y="94" width="1012" height="3" fill="#000" opacity="0.2" />
      </svg>
    </div>
  );
}
