import { useId, type ReactNode } from 'react';
import { DRUM_PIECES } from '../../lib/instruments';
import type { DrumSkin } from '../../theme/presets';

type Hit = (midi: number) => void;

interface Props {
  skin: DrumSkin;
  active: Record<number, true | undefined>;
  onDown: Hit;
  onUp: Hit;
  keyLabels: Map<number, string>;
}

const M = { kick: 36, snare: 38, stick: 37, hh: 42, hho: 46, hhp: 44, t1: 48, t2: 45, ft: 41, crash: 49, ride: 51 };

export function DrumKit({ skin, active, onDown, onUp, keyLabels }: Props) {
  const uid = useId().replace(/:/g, '');
  const ids = {
    shell: `shell-${uid}`,
    sparkle: `sparkle-${uid}`,
    grain: `grain-${uid}`,
    head: `head-${uid}`,
    cym: `cym-${uid}`,
    chrome: `chrome-${uid}`,
  };

  const handlers = (midi: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      onDown(midi);
    },
    onPointerUp: () => onUp(midi),
    onPointerCancel: () => onUp(midi),
    className: `dk-hit ${active[midi] ? 'down' : ''}`,
  });

  const keyTag = (midi: number, x: number, y: number) => {
    const k = keyLabels.get(midi);
    if (!k) return null;
    return (
      <g className="dk-key" transform={`translate(${x} ${y})`} pointerEvents="none">
        <rect x={-11} y={-10} width={22} height={18} rx={3} />
        <text y={3.5} textAnchor="middle">
          {k}
        </text>
      </g>
    );
  };

  const finishOverlay = (shape: ReactNode) =>
    skin.finish === 'sparkle' ? (
      <g filter={`url(#${ids.sparkle})`} opacity="0.55">{shape}</g>
    ) : skin.finish === 'wood' ? (
      <g filter={`url(#${ids.grain})`} opacity="0.5">{shape}</g>
    ) : null;

  /** A drum seen from slightly above: shell body plus elliptical head. */
  const drum = (midi: number, cx: number, cy: number, rx: number, ry: number, depth: number, rimMidi?: number) => {
    const body = (
      <path
        d={`M ${cx - rx} ${cy} L ${cx - rx} ${cy + depth} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy + depth} L ${cx + rx} ${cy} Z`}
      />
    );
    return (
      <g {...handlers(midi)}>
        <g fill={`url(#${ids.shell})`}>{body}</g>
        {finishOverlay(<g fill="#fff">{body}</g>)}
        {/* lugs */}
        {[-0.7, -0.25, 0.25, 0.7].map((t) => (
          <rect key={t} x={cx + rx * t - 3} y={cy + depth * 0.3} width={6} height={depth * 0.4} rx={2} fill={`url(#${ids.chrome})`} />
        ))}
        <ellipse cx={cx} cy={cy + depth} rx={rx} ry={ry} fill="none" stroke={`url(#${ids.chrome})`} strokeWidth="4" />
        <ellipse className="dk-head" cx={cx} cy={cy} rx={rx - 3} ry={ry - 2} fill={`url(#${ids.head})`} />
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={`url(#${ids.chrome})`} strokeWidth="5" />
        {rimMidi !== undefined && (
          <ellipse
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill="none"
            stroke="transparent"
            strokeWidth="14"
            {...handlers(rimMidi)}
          />
        )}
      </g>
    );
  };

  const cymbal = (midi: number, cx: number, cy: number, rx: number, ry: number, standTo: number, tilt = 0) => (
    <g>
      <line x1={cx} y1={cy} x2={cx} y2={standTo} stroke={`url(#${ids.chrome})`} strokeWidth="5" />
      <g {...handlers(midi)} transform={`rotate(${tilt} ${cx} ${cy})`}>
        <ellipse className="dk-cym" cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${ids.cym})`} />
        {[0.85, 0.7, 0.55, 0.4].map((k) => (
          <ellipse key={k} cx={cx} cy={cy} rx={rx * k} ry={ry * k} fill="none" stroke="#000" strokeOpacity="0.12" />
        ))}
        <ellipse cx={cx} cy={cy - ry * 0.12} rx={rx * 0.17} ry={ry * 0.35} fill={skin.cymbal} stroke="#000" strokeOpacity="0.25" />
        <circle cx={cx} cy={cy - ry * 0.15} r={3} fill="#222" />
      </g>
    </g>
  );

  return (
    <svg className="drumkit" viewBox="0 0 1000 540" onContextMenu={(e) => e.preventDefault()}>
      <defs>
        <linearGradient id={ids.shell} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={skin.shell} />
          <stop offset="0.18" stopColor={skin.shell} />
          <stop offset={skin.finish === 'gloss' ? '0.26' : '0.3'} stopColor="#fff" stopOpacity={skin.finish === 'matte' ? 0.05 : 0.35} />
          <stop offset="0.34" stopColor={skin.shell} />
          <stop offset="0.85" stopColor={skin.shell} />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
        <filter id={ids.sparkle}>
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="3" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 9 -7.2" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id={ids.grain}>
          <feTurbulence type="fractalNoise" baseFrequency="0.25 0.01" numOctaves="3" seed="11" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.2 -0.25" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <radialGradient id={ids.head} cx="0.45" cy="0.4" r="0.7">
          <stop offset="0" stopColor={skin.head} />
          <stop offset="0.8" stopColor={skin.head} />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </radialGradient>
        <radialGradient id={ids.cym} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.12" stopColor={skin.cymbal} />
          <stop offset="0.6" stopColor={skin.cymbal} />
          <stop offset="0.9" stopColor="#000" stopOpacity="0.25" />
          <stop offset="1" stopColor={skin.cymbal} />
        </radialGradient>
        <linearGradient id={ids.chrome} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.5" stopColor={skin.hardware} />
          <stop offset="1" stopColor="#000" stopOpacity="0.6" />
        </linearGradient>
      </defs>

      {/* floor shadow */}
      <ellipse cx="500" cy="515" rx="430" ry="18" fill="#000" opacity="0.25" />

      {/* stands behind */}
      <line x1="150" y1="250" x2="150" y2="505" stroke={`url(#${ids.chrome})`} strokeWidth="5" />
      <path d="M150 500 L110 515 M150 500 L190 515" stroke={skin.hardware} strokeWidth="3" />

      {cymbal(M.crash, 255, 105, 125, 26, 505, -6)}
      {cymbal(M.ride, 800, 140, 140, 30, 505, 5)}

      {/* hi-hat: top cymbal closed, outer edge open */}
      <g>
        <ellipse cx="150" cy="262" rx="98" ry="20" fill={`url(#${ids.cym})`} opacity="0.9" />
        <g {...handlers(M.hh)}>
          <ellipse className="dk-cym" cx="150" cy="248" rx="98" ry="20" fill={`url(#${ids.cym})`} />
          {[0.8, 0.6].map((k) => (
            <ellipse key={k} cx="150" cy="248" rx={98 * k} ry={20 * k} fill="none" stroke="#000" strokeOpacity="0.14" />
          ))}
          <ellipse cx="150" cy="245" rx="17" ry="6" fill={skin.cymbal} stroke="#000" strokeOpacity="0.25" />
        </g>
        <ellipse cx="150" cy="248" rx="98" ry="20" fill="none" stroke="transparent" strokeWidth="16" {...handlers(M.hho)} />
      </g>
      {/* hi-hat pedal */}
      <g {...handlers(M.hhp)}>
        <rect className="dk-pedal" x="118" y="470" width="64" height="26" rx="4" fill={skin.hardware} opacity="0.85" />
        <rect x="124" y="476" width="52" height="4" rx="2" fill="#000" opacity="0.3" />
      </g>

      {/* kick drum: front view */}
      <g {...handlers(M.kick)}>
        <circle cx="500" cy="385" r="128" fill={`url(#${ids.shell})`} />
        {finishOverlay(<circle cx="500" cy="385" r="128" fill="#fff" />)}
        {/* resonant front head: shell-coloured with a printed ring and a port hole */}
        <circle className="dk-head" cx="500" cy="385" r="114" fill={`url(#${ids.shell})`} />
        <circle cx="500" cy="385" r="114" fill={`url(#${ids.head})`} opacity="0.16" />
        <circle cx="500" cy="385" r="78" fill="none" stroke={skin.head} strokeOpacity="0.55" strokeWidth="3" />
        <circle cx="500" cy="385" r="70" fill="none" stroke={skin.head} strokeOpacity="0.25" strokeWidth="1" />
        <circle cx="548" cy="425" r="17" fill="#000" opacity="0.75" stroke={`url(#${ids.chrome})`} strokeWidth="2" />
        <circle cx="500" cy="385" r="114" fill="none" stroke={`url(#${ids.chrome})`} strokeWidth="6" />
        {Array.from({ length: 10 }).map((_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return <circle key={i} cx={500 + Math.cos(a) * 121} cy={385 + Math.sin(a) * 121} r="4.5" fill={`url(#${ids.chrome})`} />;
        })}
      </g>

      {drum(M.t1, 412, 215, 70, 24, 52)}
      {drum(M.t2, 588, 215, 76, 26, 56)}
      {/* tom mounts */}
      <path d="M440 260 L500 275 L560 260" stroke={skin.hardware} strokeWidth="5" fill="none" />

      {drum(M.ft, 780, 345, 104, 34, 120)}
      <line x1="700" y1="480" x2="694" y2="510" stroke={skin.hardware} strokeWidth="4" />
      <line x1="860" y1="480" x2="866" y2="510" stroke={skin.hardware} strokeWidth="4" />

      <line x1="285" y1="390" x2="285" y2="505" stroke={`url(#${ids.chrome})`} strokeWidth="4" />
      {drum(M.snare, 285, 330, 98, 32, 54, M.stick)}

      {keyTag(M.crash, 255, 70)}
      {keyTag(M.ride, 800, 102)}
      {keyTag(M.hh, 150, 226)}
      {keyTag(M.hho, 60, 250)}
      {keyTag(M.hhp, 150, 455)}
      {keyTag(M.t1, 412, 214)}
      {keyTag(M.t2, 588, 214)}
      {keyTag(M.ft, 780, 344)}
      {keyTag(M.snare, 285, 330)}
      {keyTag(M.stick, 186, 340)}
      {keyTag(M.kick, 500, 388)}
    </svg>
  );
}

export function DrumPads({ skin, active, onDown, onUp, keyLabels }: Props) {
  const order = ['crash', 'ride', 'hihat-open', 'hihat', 'tom1', 'tom2', 'floor-tom', 'hihat-foot', 'snare-stick', 'snare-drum', 'bass'];
  const pieces = order.map((k) => DRUM_PIECES.find((p) => p.key === k)!);
  return (
    <div className="pads" style={{ ['--pad' as string]: skin.pad }}>
      {pieces.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`pad ${active[p.midi] ? 'down' : ''} ${p.key === 'bass' ? 'wide' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            onDown(p.midi);
          }}
          onPointerUp={() => onUp(p.midi)}
          onPointerCancel={() => onUp(p.midi)}
        >
          <span className="pad-name">{p.label}</span>
          <span className="pad-meta">
            <span className="mono">{p.short}</span>
            {keyLabels.get(p.midi) && <kbd>{keyLabels.get(p.midi)}</kbd>}
          </span>
        </button>
      ))}
    </div>
  );
}
