import { useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { getBuffer, peaks, useBuffers } from './buffers';
import type { AudioItem, AutomationItem, Pattern } from './types';
import { groupedInstruments } from '../lib/instruments';

export function InstrumentSelect({ value, onChange, kitsOnly }: { value: string; onChange: (id: string) => void; kitsOnly?: boolean }) {
  const groups = useMemo(() => groupedInstruments(), []);
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Instrument">
      {groups
        .filter((g) => (kitsOnly === undefined ? true : kitsOnly ? g.family === 'drums' : g.family !== 'drums'))
        .map((g) => (
          <optgroup key={g.family} label={g.label}>
            {g.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  );
}

/** Notes of every channel in a pattern, drawn across `length` beats (repeats when longer). */
export function PatternPreview({ pattern, length, color }: { pattern: Pattern; length: number; color: string }) {
  const all = Object.values(pattern.notes).flat();
  if (!all.length || pattern.length <= 0) return null;
  const pitches = all.map((n) => n.pitch);
  const lo = Math.min(...pitches) - 1;
  const hi = Math.max(...pitches) + 1;
  const span = Math.max(8, hi - lo);
  const reps = Math.ceil(length / pattern.length);
  return (
    <svg className="clip-notes" viewBox={`0 0 ${length * 100} 100`} preserveAspectRatio="none">
      {Array.from({ length: reps }).flatMap((_, r) =>
        all.map((n) => {
          const x = (r * pattern.length + n.start) * 100;
          if (n.start >= pattern.length || x >= length * 100) return null;
          return (
            <rect
              key={`${r}-${n.id}`}
              x={x}
              y={((hi - n.pitch) / span) * 100 - 100 / span / 2}
              width={Math.max(6, Math.min(n.dur, pattern.length - n.start) * 100 - 4)}
              height={Math.max(3, 100 / span - 1)}
              fill={color}
            />
          );
        }),
      )}
    </svg>
  );
}

/** The automation curve, drawn across the clip. */
export function AutomationPreview({ item }: { item: AutomationItem }) {
  const pts = [...item.points].sort((a, b) => a.t - b.t);
  if (!pts.length || item.length <= 0) return null;
  const xy = pts.map((p) => `${(p.t / item.length) * 1000},${(1 - p.v) * 92 + 4}`);
  const first = pts[0];
  const last = pts[pts.length - 1];
  const line = [`0,${(1 - first.v) * 92 + 4}`, ...xy, `1000,${(1 - last.v) * 92 + 4}`].join(' ');
  return (
    <svg className="clip-notes auto-curve" viewBox="0 0 1000 100" preserveAspectRatio="none">
      <polygon points={`0,100 ${line} 1000,100`} fill="var(--clip)" opacity="0.18" />
      <polyline points={line} fill="none" stroke="var(--clip)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const bufferDuration = (id: string) => getBuffer(id)?.duration ?? 1;

export function Waveform({ item, bpm, width, height, color }: { item: AudioItem; bpm: number; width: number; height: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ready = useBuffers((s) => s.ready[item.bufferId]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const pk = peaks(item.bufferId);
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(Math.min(width, 16000)));
    const h = Math.max(1, height);
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (!pk) return;
    ctx.fillStyle = color;
    const total = pk.length;
    // peaks span the whole recording; map the clip window onto them
    const clipSec = (item.length * 60) / bpm;
    for (let x = 0; x < w; x++) {
      const sec = item.offset + (x / w) * clipSec;
      const idx = Math.floor((sec / bufferDuration(item.bufferId)) * total);
      const v = pk[Math.min(total - 1, Math.max(0, idx))] ?? 0;
      const bh = Math.max(1, v * h * 0.95);
      ctx.fillRect(x, (h - bh) / 2, 1, bh);
    }
  }, [item, bpm, width, height, color, ready]);
  return <canvas ref={ref} className="clip-wave" />;
}

/* ------------------------------------------------------------- hint bar */

/** Text for the toolbar hint bar, like FL Studio's: whatever control the mouse is over. */
export const useHint = create<{ text: string }>(() => ({ text: '' }));

export function installHints(root: HTMLElement) {
  const onOver = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-hint], [title], [aria-label]');
    const text = el?.dataset.hint ?? el?.getAttribute('title') ?? el?.getAttribute('aria-label') ?? '';
    if (text !== useHint.getState().text) useHint.setState({ text });
  };
  root.addEventListener('mouseover', onOver);
  return () => root.removeEventListener('mouseover', onOver);
}

/* ---------------------------------------------------------- drag & drop */

export type DragPayload =
  | { type: 'instrument'; id: string }
  | { type: 'preset'; id: string };

export const DRAG_MIME = 'application/x-sonare';

export function readDrag(e: React.DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null;
  }
}
export const isSonareDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_MIME);
