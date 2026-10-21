import { useId, useMemo, useRef } from 'react';
import { isBlack, noteName, pitchClass } from '../../lib/notes';
import type { MalletSkin } from '../../theme/presets';

/** Marimba-style layout: naturals on the front row, accidentals raised behind them. */
export function Mallets({
  low,
  high,
  skin,
  active,
  onDown,
  onUp,
  keyLabels,
  showNames,
}: {
  low: number;
  high: number;
  skin: MalletSkin;
  active: Record<number, true | undefined>;
  onDown: (midi: number) => void;
  onUp: (midi: number) => void;
  keyLabels?: Map<number, string>;
  showNames: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const barId = `bar-${uid}`;
  const grainId = `mgrain-${uid}`;
  const tubeId = `mtube-${uid}`;
  const pointers = useRef(new Map<number, number>());

  const { naturals, sharps } = useMemo(() => {
    const naturals: number[] = [];
    const sharps: { midi: number; pos: number }[] = [];
    for (let m = low; m <= high; m++) {
      if (isBlack(m)) sharps.push({ midi: m, pos: naturals.length });
      else naturals.push(m);
    }
    return { naturals, sharps };
  }, [low, high]);

  const W = 1200;
  const gap = 4;
  const bw = W / naturals.length;
  const maxH = 250;
  const minH = 130;
  const heightOf = (m: number) => maxH - ((m - low) / Math.max(1, high - low)) * (maxH - minH);
  const frontTop = 175;
  const backTop = 20;
  const metal = skin.finish === 'metal';

  const fire = (id: number, midi: number | null) => {
    const prev = pointers.current.get(id);
    if (prev === midi) return;
    if (prev !== undefined) onUp(prev);
    if (midi === null) pointers.current.delete(id);
    else {
      pointers.current.set(id, midi);
      onDown(midi);
    }
  };
  const midiAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<SVGElement>('[data-midi]');
    return el ? Number(el.dataset.midi) : null;
  };

  const bar = (m: number, x: number, y: number, w: number, h: number) => (
    <g key={m} data-midi={m} className={`mbar ${active[m] ? 'down' : ''}`}>
      <rect x={x + gap / 2} y={y} width={w - gap} height={h} rx={4} fill={`url(#${barId})`} />
      {!metal && <rect x={x + gap / 2} y={y} width={w - gap} height={h} rx={4} fill="#000" filter={`url(#${grainId})`} />}
      {active[m] && <rect x={x + gap / 2} y={y} width={w - gap} height={h} rx={4} fill={skin.pressed} opacity="0.4" />}
      {/* suspension cord holes */}
      <circle cx={x + w / 2} cy={y + h * 0.22} r={2.4} fill="#000" opacity="0.45" />
      <circle cx={x + w / 2} cy={y + h * 0.78} r={2.4} fill="#000" opacity="0.45" />
      {showNames && (
        <text x={x + w / 2} y={y + h * 0.55} textAnchor="middle" className={`mbar-label ${pitchClass(m) === 0 ? 'c' : ''}`}>
          {noteName(m, pitchClass(m) === 0)}
        </text>
      )}
      {keyLabels?.get(m) && (
        <text x={x + w / 2} y={y + h - 10} textAnchor="middle" className="mbar-key">
          {keyLabels.get(m)}
        </text>
      )}
    </g>
  );

  return (
    <svg
      className="mallets"
      viewBox={`0 0 ${W} 470`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        fire(e.pointerId, midiAt(e.clientX, e.clientY));
      }}
      onPointerMove={(e) => pointers.current.has(e.pointerId) && fire(e.pointerId, midiAt(e.clientX, e.clientY))}
      onPointerUp={(e) => fire(e.pointerId, null)}
      onPointerCancel={(e) => fire(e.pointerId, null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <linearGradient id={barId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.3" />
          <stop offset="0.12" stopColor={skin.bar} />
          <stop offset="0.45" stopColor={metal ? '#fff' : skin.bar} stopOpacity={metal ? 0.55 : 1} />
          <stop offset="0.6" stopColor={skin.bar} />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={tubeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.4" />
          <stop offset="0.4" stopColor={skin.resonator} />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#000" stopOpacity="0.5" />
        </linearGradient>
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.3 0.008" numOctaves="3" seed="2" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      {/* resonators */}
      {naturals.map((m, i) => {
        const h = heightOf(m);
        return (
          <rect
            key={`r${m}`}
            x={i * bw + bw * 0.28}
            y={frontTop + h - 20}
            width={bw * 0.44}
            height={Math.max(30, 460 - (frontTop + h - 20) - (i / naturals.length) * 60)}
            rx={bw * 0.2}
            fill={`url(#${tubeId})`}
            opacity="0.9"
          />
        );
      })}
      {/* frame rails */}
      <rect x="0" y={frontTop + 18} width={W} height="10" rx="3" fill={skin.frame} />
      <rect x="0" y={backTop + 30} width={W} height="8" rx="3" fill={skin.frame} />

      {naturals.map((m, i) => bar(m, i * bw, frontTop, bw, heightOf(m)))}
      {sharps.map(({ midi, pos }) => bar(midi, pos * bw - bw / 2, backTop, bw, heightOf(midi) * 0.62))}
    </svg>
  );
}
