import { useEffect, useRef, useState } from 'react';
import { RotateCcw, ZoomIn } from 'lucide-react';
import { useStudio, mapItem } from './store';
import { currentBeat } from './playback';
import { AUTO_PARAMS, autoLabel } from './automation';
import type { AutomationItem } from './types';
import { Range } from '../components/ui';
import type { AutoParam } from '../audio/engine';

const H = 220;
const PAD = 10;

/** Draw an automation curve: click to add a point, drag to move, double-click or right-click to remove. */
export function AutomationEditor({ item }: { item: AutomationItem }) {
  const s = useStudio();
  const p = s.project;
  const [ppb, setPpb] = useState(() => (item.length <= 8 ? 80 : item.length <= 16 ? 48 : 28));
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const playRef = useRef<SVGLineElement>(null);
  const drag = useRef<{ index: number; moved: boolean } | null>(null);
  const W = item.length * ppb;
  const pts = [...item.points].sort((a, b) => a.t - b.t);
  const channel = p.tracks.find((t) => t.id === item.target.channelId);
  const color = channel?.color ?? 'var(--primary)';

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const st = useStudio.getState();
      const b = st.playing && st.project.mode === 'song' ? currentBeat() - item.start : -1;
      if (playRef.current) {
        const show = b >= 0 && b <= item.length;
        playRef.current.style.display = show ? 'block' : 'none';
        playRef.current.setAttribute('x1', String(b * ppb));
        playRef.current.setAttribute('x2', String(b * ppb));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [item.start, item.length, ppb]);

  const setPoints = (fn: (pts: AutomationItem['points']) => AutomationItem['points'], record = true) =>
    s.edit((pr) => mapItem(pr, item.id, (it) => (it.kind === 'automation' ? { ...it, points: fn(it.points) } : it)), record);

  const toXY = (pt: { t: number; v: number }) => ({ x: pt.t * ppb, y: PAD + (1 - pt.v) * (H - PAD * 2) });
  const fromEvent = (e: React.PointerEvent | React.MouseEvent, fine: boolean) => {
    const r = svgRef.current!.getBoundingClientRect();
    const rawT = ((e.clientX - r.left) / r.width) * item.length;
    const t = Math.max(0, Math.min(item.length, fine ? rawT : Math.round(rawT * 4) / 4));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top - PAD) / (H - PAD * 2)));
    return { t, v };
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const hit = (e.target as Element).closest<SVGElement>('[data-point]');
    s.checkpoint();
    if (hit) {
      const index = Number(hit.dataset.point);
      drag.current = { index, moved: false };
      setActive(index);
      return;
    }
    const pt = fromEvent(e, e.shiftKey);
    const next = [...pts, pt].sort((a, b) => a.t - b.t);
    const index = next.indexOf(pt);
    setPoints(() => next, false);
    drag.current = { index, moved: true };
    setActive(index);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    const pt = fromEvent(e, e.shiftKey);
    setPoints((cur) => {
      const sorted = [...cur].sort((a, b) => a.t - b.t);
      const lo = d.index > 0 ? sorted[d.index - 1].t : 0;
      const hi = d.index < sorted.length - 1 ? sorted[d.index + 1].t : item.length;
      sorted[d.index] = { t: Math.max(lo, Math.min(hi, pt.t)), v: pt.v };
      return sorted;
    }, false);
  };
  const onUp = () => {
    drag.current = null;
  };
  const remove = (index: number) => {
    if (pts.length <= 1) return;
    setPoints((cur) => [...cur].sort((a, b) => a.t - b.t).filter((_, i) => i !== index));
    setActive(null);
  };

  const line = pts.length
    ? [`0,${toXY(pts[0]).y}`, ...pts.map((pt) => `${toXY(pt).x},${toXY(pt).y}`), `${W},${toXY(pts[pts.length - 1]).y}`].join(' ')
    : '';
  const shown = active !== null && pts[active] ? pts[active] : null;
  const paramChoices = item.target.channelId === 'master' ? AUTO_PARAMS.filter((a) => a.id === 'volume') : AUTO_PARAMS;
  const bars = Math.ceil(item.length / p.beatsPerBar);

  return (
    <div className="ae">
      <div className="pr-toolbar">
        <span className="pr-swatch" style={{ background: color }} />
        <b className="ae-title">Automation</b>
        <select
          className="select"
          value={item.target.channelId}
          onChange={(e) =>
            s.edit((pr) =>
              mapItem(pr, item.id, (it) =>
                it.kind === 'automation'
                  ? { ...it, target: { channelId: e.target.value, param: e.target.value === 'master' ? 'volume' : it.target.param } }
                  : it,
              ),
            )
          }
          aria-label="Channel"
          data-hint="Which channel this curve controls"
        >
          <option value="master">Master</option>
          {p.tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={item.target.param}
          onChange={(e) => s.edit((pr) => mapItem(pr, item.id, (it) => (it.kind === 'automation' ? { ...it, target: { ...it.target, param: e.target.value as AutoParam } } : it)))}
          aria-label="Parameter"
          data-hint="What the curve moves. Filter cutoff needs a Filter effect on the channel (Mixer → Effects)"
        >
          {paramChoices.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <span className="faint mono ae-readout">
          {shown ? `${(shown.t / p.beatsPerBar + 1).toFixed(2)} bar · ${autoLabel(item.target.param, shown.v)}` : `${bars} bar${bars > 1 ? 's' : ''} · ${pts.length} points`}
        </span>
        <button
          className="btn sm"
          onClick={() => setPoints(() => [{ t: 0, v: pts[0]?.v ?? 0.8 }, { t: item.length, v: pts[0]?.v ?? 0.8 }])}
          data-hint="Back to a flat line"
        >
          <RotateCcw /> Flatten
        </button>
        <div className="spacer" />
        <span className="faint pr-help">Click to add · drag to move (Shift = no snap) · double-click or right-click a point to remove</span>
        <ZoomIn size={14} className="faint" />
        <div style={{ width: 100 }}>
          <Range value={ppb} min={12} max={160} step={2} onChange={setPpb} ariaLabel="Zoom" />
        </div>
      </div>
      <div className="ae-scroll">
        <svg
          ref={svgRef}
          className="ae-graph"
          width={W}
          height={H}
          style={{ ['--clip' as string]: color }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={(e) => {
            e.preventDefault();
            const hit = (e.target as Element).closest<SVGElement>('[data-point]');
            if (hit) remove(Number(hit.dataset.point));
          }}
          onDoubleClick={(e) => {
            const hit = (e.target as Element).closest<SVGElement>('[data-point]');
            if (hit) remove(Number(hit.dataset.point));
          }}
        >
          {Array.from({ length: Math.ceil(item.length) + 1 }).map((_, b) => (
            <line key={b} x1={b * ppb} x2={b * ppb} y1={0} y2={H} className={b % p.beatsPerBar === 0 ? 'ae-bar' : 'ae-beat'} />
          ))}
          {[0.25, 0.5, 0.75].map((y) => (
            <line key={y} x1={0} x2={W} y1={PAD + y * (H - PAD * 2)} y2={PAD + y * (H - PAD * 2)} className="ae-beat" />
          ))}
          <polygon points={`0,${H} ${line} ${W},${H}`} className="ae-fill" />
          <polyline points={line} className="ae-line" />
          {pts.map((pt, i) => {
            const { x, y } = toXY(pt);
            return <circle key={i} data-point={i} cx={x} cy={y} r={active === i ? 7 : 5.5} className={`ae-point ${active === i ? 'on' : ''}`} />;
          })}
          <line ref={playRef} y1={0} y2={H} className="ae-play" />
        </svg>
      </div>
    </div>
  );
}
