import { useEffect, useRef, useState, type ReactNode } from 'react';
import type * as Tone from 'tone';
import { Maximize, Minimize } from 'lucide-react';

export function Range({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  className = '',
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className={`range ${className}`}
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={ariaLabel}
      style={{ ['--fill' as string]: `${fill}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    />
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`seg ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          title={o.title}
          aria-selected={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Rotary control: drag vertically, shift for fine, double-click to reset. */
export function Knob({
  value,
  min,
  max,
  onChange,
  label,
  format,
  size = 34,
  defaultValue,
  bipolar,
  onStart,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** called when a drag / reset begins (e.g. to take an undo snapshot) */
  onStart?: () => void;
  label?: string;
  format?: (v: number) => string;
  size?: number;
  defaultValue?: number;
  bipolar?: boolean;
}) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const norm = (value - min) / (max - min);
  const a0 = -135;
  const angle = a0 + norm * 270;
  const r = size / 2 - 3;
  const c = size / 2;
  const pt = (deg: number, rad = r) => {
    const t = ((deg - 90) * Math.PI) / 180;
    return [c + rad * Math.cos(t), c + rad * Math.sin(t)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = pt(from);
    const [x2, y2] = pt(to);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    const sweep = to > from ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
  };
  const start = bipolar ? 0 : a0;
  const [ix, iy] = pt(angle, r - 5);

  return (
    <div className="knob">
      <svg
        width={size}
        height={size}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onPointerDown={(e) => {
          try {
            (e.target as Element).setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          onStart?.();
          drag.current = { y: e.clientY, v: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const range = max - min;
          const dy = drag.current.y - e.clientY;
          const next = drag.current.v + (dy / (e.shiftKey ? 600 : 150)) * range;
          onChange(Math.max(min, Math.min(max, next)));
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        onKeyDown={(e) => {
          const stepv = (max - min) / 50;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(Math.min(max, value + stepv));
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(Math.max(min, value - stepv));
          e.stopPropagation();
        }}
        onWheel={(e) => {
          const stepv = (max - min) / 60;
          onChange(Math.max(min, Math.min(max, value + (e.deltaY < 0 ? stepv : -stepv))));
        }}
      >
        <circle cx={c} cy={c} r={r - 3.5} fill="var(--panel-alt)" stroke="var(--border-strong)" />
        <path d={arc(a0, a0 + 270)} stroke="var(--border)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {Math.abs(angle - start) > 0.5 && (
          <path
            d={angle > start ? arc(start, angle) : arc(angle, start)}
            stroke="var(--primary)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
        )}
        <line x1={c} y1={c} x2={ix} y2={iy} stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {label && <span className="knob-label">{label}</span>}
      {format && <span className="knob-value">{format(value)}</span>}
    </div>
  );
}

/** Polls a Tone.Meter and draws a level bar without React re-renders. */
export function LevelMeter({
  meter,
  vertical = true,
  className = '',
  style,
}: {
  meter: Tone.Meter;
  vertical?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const bars = useRef<HTMLElement[]>([]);
  const [channels] = useState(() => meter.channels);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = meter.getValue();
      const vals = Array.isArray(v) ? v : [v];
      vals.forEach((db, i) => {
        const el = bars.current[i];
        if (!el) return;
        const pct = Math.max(0, Math.min(1, (db + 60) / 63)) * 100;
        if (vertical) el.style.height = `${pct}%`;
        else el.style.width = `${pct}%`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [meter, vertical]);
  return (
    <div className={`levels ${vertical ? 'v' : 'h'} ${className}`} style={style}>
      {Array.from({ length: channels }).map((_, i) => (
        <div className="meter" key={i}>
          <i
            ref={(el) => {
              if (el) bars.current[i] = el;
            }}
            style={vertical ? { width: '100%', height: 0 } : { height: '100%', width: 0 }}
          />
        </div>
      ))}
    </div>
  );
}

/** Bottom sheet for phones: slides over the page, closes on backdrop tap or Escape. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  tall = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  tall?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-root" role="dialog" aria-modal="true">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet ${tall ? 'tall' : ''}`}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function ColorField({
  value,
  onChange,
  label,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  hint?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="color-field">
      <span className="swatch" style={{ background: value }}>
        <input type="color" value={value.slice(0, 7)} onChange={(e) => onChange(e.target.value)} />
      </span>
      <span className="color-meta">
        <span className="color-label">{label}</span>
        {hint && <span className="color-hint">{hint}</span>}
      </span>
      <input
        className="input mono color-hex"
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value);
        }}
      />
    </label>
  );
}

/** Whole-app full screen toggle (hidden where the browser doesn't support it, e.g. iPhone Safari). */
export function useFullscreen() {
  const [on, setOn] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const supported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };
  return { on, toggle, supported };
}

export function FullscreenButton({ className = 'btn icon ghost', withLabel = false }: { className?: string; withLabel?: boolean }) {
  const fs = useFullscreen();
  if (!fs.supported) return null;
  return (
    <button className={className} onClick={fs.toggle} title={fs.on ? 'Exit full screen' : 'Full screen'} aria-label={fs.on ? 'Exit full screen' : 'Full screen'}>
      {fs.on ? <Minimize /> : <Maximize />}
      {withLabel && <span>{fs.on ? 'Exit full screen' : 'Full screen'}</span>}
    </button>
  );
}
